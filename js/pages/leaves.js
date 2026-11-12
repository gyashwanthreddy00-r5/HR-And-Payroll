import { html, useState, sb, q, loadXLSX } from '../lib.js';
import { useAsync, Async, useAction, Field, Modal, Badge } from '../ui.js';
import { listEmployees, listLeaveTypes, listHolidays, listLeaves } from '../data.js';
import { monthCalendar, countLeaves, daysInMonthFor } from '../engine.js';
import { MONTHS, monthLabel, ym, parseYm, monthStart, monthEnd, prevMonth, nextMonth, toIsoDate, navigate, downloadCSV, fmt, pad } from '../util.js';

/** Screen 5 — month view per employee, plus a grid for everyone. */
export function Leaves({ ctx, query }) {
  const { year, month } = parseYm(query.get('month'));
  const view = query.get('view') || 'employee';
  const empId = query.get('emp');
  const cid = ctx.company.id;
  const setQ = patch => {
    const p = new URLSearchParams({ month: ym(year, month), view, ...(empId ? { emp: empId } : {}), ...patch });
    navigate('/leaves?' + p.toString());
  };
  const st = useAsync(async () => {
    const [emps, types, hols, leaves] = await Promise.all([
      listEmployees(cid), listLeaveTypes(cid), listHolidays(cid),
      listLeaves(cid, `${year}-01-01`, monthEnd(year, month)),
    ]);
    return { emps: emps.filter(e => e.status === 'active' || (e.exit_date && e.exit_date >= monthStart(year, month))), types, hols, leaves };
  }, [cid, year, month]);
  const [uploading, setUploading] = useState(false);

  return html`<${Async} state=${st}>${({ emps, types, hols, leaves }) => {
    const cal = monthCalendar(year, month, ctx.company.weekly_offs || [0, 6], hols);
    const monthLeaves = leaves.filter(l => l.date >= monthStart(year, month));
    const emp = emps.find(e => e.id === empId) || emps[0];
    const p = prevMonth(year, month), n = nextMonth(year, month);
    return html`<div class="stack">
      <div class="row between"><h1 style="margin:0">Leaves & attendance</h1>
        <div class="tabs" style="margin:0;border:0">
          <button class=${view === 'employee' ? 'active' : ''} onClick=${() => setQ({ view: 'employee' })}>Employee month</button>
          <button class=${view === 'grid' ? 'active' : ''} onClick=${() => setQ({ view: 'grid' })}>Everyone (grid)</button>
        </div></div>
      <div class="row">
        ${view === 'employee' && html`<select style="width:240px" value=${emp?.id} onChange=${e => setQ({ emp: e.target.value })}>${emps.map(e => html`<option value=${e.id}>${e.name} (${e.emp_code})</option>`)}</select>`}
        <button class="sm" onClick=${() => setQ({ month: ym(p.year, p.month) })}>‹</button>
        <input type="month" style="width:170px" value=${ym(year, month)} onChange=${e => e.target.value && setQ({ month: e.target.value })} />
        <button class="sm" onClick=${() => setQ({ month: ym(n.year, n.month) })}>›</button>
        <span class="spacer" />
        ${ctx.can.edit && html`<button onClick=${() => setUploading(true)}>Upload attendance Excel</button>`}
      </div>
      ${!emps.length ? html`<div class="empty">Add employees first.</div>`
        : view === 'grid'
          ? html`<${LeaveGrid} ctx=${ctx} emps=${emps} cal=${cal} leaves=${monthLeaves} types=${types} reload=${st.reload} />`
          : html`<${EmployeeMonth} ctx=${ctx} emp=${emp} cal=${cal} year=${year} month=${month} leaves=${leaves.filter(l => l.employee_id === emp.id)} types=${types} reload=${st.reload} />`}
      ${uploading && html`<${UploadAttendance} ctx=${ctx} emps=${emps} types=${types} cal=${cal} year=${year} month=${month} onClose=${() => { setUploading(false); st.reload(); }} />`}
    </div>`;
  }}<//>`;
}

const cellClass = (entry, types) => {
  if (!entry) return '';
  if (entry.kind === 'absent') return 'unpaid';
  const t = types.find(t => t.id === entry.leave_type_id);
  return t?.paid ? 'paid' : 'unpaid';
};
const entryCode = (entry, types) => !entry ? '' : entry.kind === 'absent' ? 'A' : (types.find(t => t.id === entry.leave_type_id)?.code || 'L');

function EmployeeMonth({ ctx, emp, cal, year, month, leaves, types, reload }) {
  const [editing, setEditing] = useState(null);
  const monthLeaves = leaves.filter(l => l.date >= monthStart(year, month));
  const byDate = new Map(monthLeaves.map(l => [l.date, l]));
  const basis = ctx.company.lop_basis;
  const dim = daysInMonthFor(basis, cal);
  const lv = countLeaves({ cal, entries: monthLeaves, leaveTypes: types, basis, doj: emp.doj, exitDate: emp.exit_date });
  // balances: year-to-date usage up to the end of this month
  const ytd = countLeaves({ cal: yearCal(year, month, ctx.company, cal), entries: leaves, leaveTypes: types, basis: 'calendar' });
  const firstDow = (cal[0].dow + 6) % 7; // Monday-first grid

  return html`<div class="card"><div class="grid" style="grid-template-columns:minmax(280px,1fr) minmax(260px,1fr);gap:24px;align-items:start">
    <div>
      <div class="cal">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => html`<div class="h">${d}</div>`)}
        ${Array.from({ length: firstDow }, () => html`<div></div>`)}
        ${cal.map(d => {
          const e = byDate.get(d.date);
          const cls = ['d', d.isOff ? 'off' : '', d.isHoliday ? 'hol' : '', cellClass(e, types), e?.half_day ? 'half' : ''].join(' ');
          return html`<div class=${cls} title=${d.holidayName || (e ? entryCode(e, types) + (e.note ? ' · ' + e.note : '') : '')}
            onClick=${() => ctx.can.edit && setEditing({ date: d.date, entry: e })}>${d.day}</div>`;
        })}
      </div>
      <div class="legend"><span><i style="background:var(--paid)"></i>Paid leave</span><span><i style="background:var(--unpaid)"></i>Unpaid leave / absent (LOP)</span><span><i style="background:#f3f2ee"></i>Weekly off / holiday</span></div>
      ${ctx.can.edit && html`<p class="small muted">Click a day to add or change leave. <button class="link" onClick=${() => setEditing({ date: cal.find(d => d.isWorking)?.date || cal[0].date, range: true })}>Add leave for a date range</button></p>`}
    </div>
    <div class="card flush"><table>
      <thead><tr><th>Summary · ${monthLabel(year, month)}</th><th class="num">Days</th></tr></thead>
      <tbody>
        <tr><td>Days in month <span class="small muted">(${basis === 'working' ? 'working days' : basis === 'fixed30' ? 'fixed 30' : 'calendar'})</span></td><td class="num">${dim}</td></tr>
        ${Object.entries(lv.byType).map(([code, n]) => { const t = types.find(t => t.code === code); return html`<tr><td>${t?.name || code} (${t?.paid ? 'paid' : 'LOP'})</td><td class="num">${n}</td></tr>`; })}
        ${lv.absent > 0 && html`<tr><td>Absent (LOP)</td><td class="num">${lv.absent}</td></tr>`}
        ${lv.notEmployed > 0 && html`<tr><td>Not yet joined / after exit (LOP)</td><td class="num">${lv.notEmployed}</td></tr>`}
        <tr class="total"><td>Paid days</td><td class="num">${dim - Math.min(lv.lop, dim)}</td></tr>
        ${types.filter(t => t.paid && t.annual_quota > 0).map(t => html`<tr><td>${t.code} balance after</td><td class="num">${fmt(t.annual_quota - (ytd.byType[t.code] || 0))}</td></tr>`)}
      </tbody>
    </table></div>
  </div>
  ${editing && html`<${LeaveModal} ctx=${ctx} emp=${emp} types=${types} cal=${cal} init=${editing} onClose=${() => setEditing(null)} onSaved=${() => { setEditing(null); reload(); }} />`}
  </div>`;
}

/** Calendar days from Jan 1 to the end of the given month (for YTD balances). */
function yearCal(year, month, company, cal) {
  const days = [];
  for (let m = 1; m < month; m++) days.push(...monthCalendar(year, m, company.weekly_offs || [0, 6], []));
  return [...days, ...cal];
}

function LeaveModal({ ctx, emp, types, cal, init, onClose, onSaved }) {
  const [f, setF] = useState({
    from: init.date, to: init.date,
    type: init.entry ? (init.entry.kind === 'absent' ? 'absent' : init.entry.leave_type_id) : (types[0]?.id || 'absent'),
    half_day: init.entry?.half_day || false, note: init.entry?.note || '',
  });
  const [busy, act] = useAction();
  const save = () => act(async () => {
    const dates = cal.filter(d => d.date >= f.from && d.date <= f.to && d.isWorking).map(d => d.date);
    if (!dates.length) throw new Error('No working days in that range (weekly offs and holidays are skipped).');
    const rows = dates.map(date => ({
      company_id: ctx.company.id, employee_id: emp.id, date,
      kind: f.type === 'absent' ? 'absent' : 'leave', leave_type_id: f.type === 'absent' ? null : f.type,
      half_day: f.half_day, status: 'approved', note: f.note || null,
    }));
    await q(sb.from('leave_entries').upsert(rows, { onConflict: 'employee_id,date' }));
    onSaved();
  }, 'Saved');
  const remove = () => act(async () => { await q(sb.from('leave_entries').delete().eq('id', init.entry.id)); onSaved(); }, 'Removed');
  return html`<${Modal} title=${`${init.entry ? 'Edit' : 'Add'} leave · ${emp.name}`} onClose=${onClose}>
    <div class="stack">
      <div class="grid g2">
        <${Field} label="From"><input type="date" value=${f.from} onInput=${e => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} /><//>
        <${Field} label="To"><input type="date" value=${f.to} min=${f.from} onInput=${e => setF({ ...f, to: e.target.value })} /><//>
      </div>
      <${Field} label="Type"><select value=${f.type} onChange=${e => setF({ ...f, type: e.target.value })}>
        ${types.map(t => html`<option value=${t.id}>${t.name} (${t.paid ? 'paid' : 'unpaid · LOP'})</option>`)}
        <option value="absent">Absent (LOP)</option>
      </select><//>
      <label class="check"><input type="checkbox" checked=${f.half_day} onChange=${e => setF({ ...f, half_day: e.target.checked })} /> Half day</label>
      <${Field} label="Note"><input value=${f.note} onInput=${e => setF({ ...f, note: e.target.value })} /><//>
      <div class="row">${init.entry && html`<button class="danger" disabled=${busy} onClick=${remove}>Remove leave</button>`}<span class="spacer" />
        <button onClick=${onClose}>Cancel</button><button class="primary" disabled=${busy} onClick=${save}>Save</button></div>
    </div>
  <//>`;
}

function LeaveGrid({ ctx, emps, cal, leaves, types, reload }) {
  const [editing, setEditing] = useState(null);
  const key = (e, d) => e + '|' + d;
  const map = new Map(leaves.map(l => [key(l.employee_id, l.date), l]));
  const basis = ctx.company.lop_basis;
  return html`<div class="card flush"><div class="table-wrap"><table class="leave-grid">
    <thead><tr><th>Employee</th>${cal.map(d => html`<th class=${d.isWorking ? '' : 'muted'}>${d.day}<div style="font-weight:400">${'SMTWTFS'[d.dow]}</div></th>`)}<th>LOP</th></tr></thead>
    <tbody>${emps.map(emp => {
      const mine = leaves.filter(l => l.employee_id === emp.id);
      const lv = countLeaves({ cal, entries: mine, leaveTypes: types, basis, doj: emp.doj, exitDate: emp.exit_date });
      return html`<tr><td>${emp.name} <span class="mono small muted">${emp.emp_code}</span></td>
        ${cal.map(d => {
          const e = map.get(key(emp.id, d.date));
          return html`<td><div class=${'cell ' + (d.isWorking ? cellClass(e, types) : 'off')} title=${d.holidayName || ''}
            onClick=${() => ctx.can.edit && d.isWorking && setEditing({ emp, date: d.date, entry: e })}>${d.isWorking ? entryCode(e, types) + (e?.half_day ? '½' : '') : '·'}</div></td>`;
        })}
        <td class="num"><b>${lv.lop}</b></td></tr>`;
    })}</tbody>
  </table></div>
  <p class="small muted" style="padding:0 12px">Codes: ${types.map(t => `${t.code} = ${t.name}`).join(' · ')} · A = Absent. Click a cell to edit.</p>
  ${editing && html`<${LeaveModal} ctx=${ctx} emp=${editing.emp} types=${types} cal=${cal} init=${editing} onClose=${() => setEditing(null)} onSaved=${() => { setEditing(null); reload(); }} />`}
  </div>`;
}

// ---------------------------------------------------------------- upload
function UploadAttendance({ ctx, emps, types, cal, year, month, onClose }) {
  const [report, setReport] = useState(null);
  const [busy, act] = useAction();
  const codes = new Map(types.map(t => [t.code.toUpperCase(), t]));

  const template = async () => {
    const XLSX = await loadXLSX();
    // Wide format: one row per employee, one column per day; cells hold leave codes.
    const header = ['emp_code', 'name', ...cal.map(d => d.day)];
    const rows = emps.map(e => [e.emp_code, e.name, ...cal.map(d => d.isWorking ? '' : 'WO')]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, `${MONTHS[month - 1].slice(0, 3)} ${year}`);
    XLSX.writeFile(wb, `attendance-${ym(year, month)}.xlsx`);
  };

  const run = file => act(async () => {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const byCode = new Map(emps.map(e => [e.emp_code.toUpperCase(), e]));
    const calByDay = new Map(cal.map(d => [String(d.day), d]));
    const upserts = [], deletes = [], issues = [];
    const parseCode = raw => {
      let c = String(raw).trim().toUpperCase();
      if (!c || c === 'P' || c === 'WO' || c === 'H' || c === '-') return { clear: true };
      let half = false;
      if (c.endsWith('½') || c.endsWith('/2') || c.startsWith('HD-') || c.endsWith('-H')) { half = true; c = c.replace(/½|\/2|^HD-|-H$/g, ''); }
      if (c === 'A' || c === 'AB' || c === 'ABSENT') return { kind: 'absent', half };
      const t = codes.get(c);
      return t ? { kind: 'leave', type: t, half } : { error: `unknown code "${raw}"` };
    };
    const isLong = data.length && ('date' in Object.fromEntries(Object.keys(data[0]).map(k => [k.toLowerCase(), 1])));
    data.forEach((row0, i) => {
      const row = Object.fromEntries(Object.entries(row0).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
      const emp = byCode.get(String(row.emp_code || row['employee id'] || '').trim().toUpperCase());
      if (!emp) { issues.push(`Row ${i + 2}: unknown employee "${row.emp_code || ''}"`); return; }
      const cells = isLong
        ? [[toIsoDate(row.date), row.type ?? row.code ?? row.status ?? '', row.half_day]]
        : Object.entries(row).filter(([k]) => calByDay.has(k)).map(([k, v]) => [calByDay.get(k).date, v]);
      for (const [date, val, halfFlag] of cells) {
        const d = cal.find(c => c.date === date);
        if (!d) { issues.push(`Row ${i + 2}: date ${date} is not in ${monthLabel(year, month)}`); continue; }
        const p = parseCode(val);
        if (p.error) { issues.push(`Row ${i + 2} ${emp.emp_code} ${date}: ${p.error}`); continue; }
        if (p.clear) { if (!isLong || String(val).trim()) deletes.push({ emp: emp.id, date }); continue; }
        if (!d.isWorking) continue;
        upserts.push({ company_id: ctx.company.id, employee_id: emp.id, date, kind: p.kind, leave_type_id: p.type?.id || null,
          half_day: p.half || ['1', 'true', 'yes', 'y'].includes(String(halfFlag ?? '').toLowerCase()), status: 'approved' });
      }
    });
    if (upserts.length) await q(sb.from('leave_entries').upsert(upserts, { onConflict: 'employee_id,date' }));
    // Present / blank cells in the wide format clear an existing entry for that day.
    const byEmp = new Map();
    for (const d of deletes) { if (!byEmp.has(d.emp)) byEmp.set(d.emp, []); byEmp.get(d.emp).push(d.date); }
    for (const [emp, dates] of byEmp) await q(sb.from('leave_entries').delete().eq('employee_id', emp).in('date', dates));
    setReport({ saved: upserts.length, issues });
  });

  return html`<${Modal} title=${`Upload attendance · ${monthLabel(year, month)}`} onClose=${onClose} wide>
    ${!report ? html`<div class="stack">
      <p class="muted" style="margin:0">Two formats are accepted:</p>
      <ul class="muted" style="margin:0">
        <li><b>Grid</b>: columns <span class="mono">emp_code, name, 1, 2, … ${cal.length}</span>. Put a leave code in a day cell (${types.map(t => t.code).join(', ')}, or <b>A</b> for absent; add <b>½</b> for a half day). Blank or P = present.</li>
        <li><b>List</b>: columns <span class="mono">emp_code, date, type, half_day</span>, one row per leave day.</li>
      </ul>
      <div class="row"><button onClick=${template}>Download grid template</button>
        <input type="file" accept=".xlsx,.xls,.csv" disabled=${busy} style="width:auto" onChange=${e => e.target.files[0] && run(e.target.files[0])} />
        ${busy && html`<span class="muted">Uploading…</span>`}</div>
    </div>` : html`<div class="stack">
      <div class="row"><${Badge} kind="ok">${report.saved} leave days saved<//>${report.issues.length ? html`<${Badge} kind="warn">${report.issues.length} issues<//>` : ''}
        <span class="spacer" />${report.issues.length ? html`<button onClick=${() => downloadCSV([['issue'], ...report.issues.map(x => [x])], 'attendance-issues.csv')}>Download issues</button>` : ''}</div>
      ${report.issues.length > 0 && html`<div class="card" style="max-height:40vh;overflow:auto"><ul style="margin:0">${report.issues.map(x => html`<li>${x}</li>`)}</ul></div>`}
      <div class="row"><span class="spacer" /><button class="primary" onClick=${onClose}>Done</button></div>
    </div>`}
  <//>`;
}
