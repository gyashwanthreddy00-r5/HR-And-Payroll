import { html, useState, useMemo, sb, q, loadXLSX } from '../lib.js';
import { useAsync, Async, useAction, Field, Badge, Modal } from '../ui.js';
import { listEmployees, listSalaries, listStructures, listComponents, salaryMap, listPtSlabs } from '../data.js';
import { mergeComponents, calculatePayroll, monthCalendar, ruleLabel } from '../engine.js';
import { fmt, fmtDate, navigate, toIsoDate, downloadCSV, monthLabel, toast } from '../util.js';
import { generatePayslipPdf } from '../payslip.js';
import { ErPfPolicy, EmployerRows, DeductionRows } from './employer.js';

const today = () => new Date().toISOString().slice(0, 10);

export function nextEmpCode(prefix, employees) {
  let max = 0;
  for (const e of employees) {
    if (!e.emp_code.startsWith(prefix)) continue;
    const n = parseInt(e.emp_code.slice(prefix.length), 10);
    if (!isNaN(n)) max = Math.max(max, n);
  }
  return prefix + String(max + 1).padStart(3, '0');
}

// ================================================================ list
export function Employees({ ctx }) {
  const cid = ctx.company.id;
  const st = useAsync(async () => {
    const [emps, sals, structs] = await Promise.all([listEmployees(cid), listSalaries(cid), listStructures(cid)]);
    return { emps, sal: salaryMap(sals, '9999-12-31'), structs: new Map(structs.map(s => [s.id, s])), structList: structs };
  }, [cid]);
  const [f, setF] = useState({ search: '', dept: '', status: 'active' });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  return html`<${Async} state=${st}>${({ emps, sal, structs, structList }) => {
    const depts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort();
    const s = f.search.trim().toLowerCase();
    const rows = emps.filter(e =>
      (!s || e.name.toLowerCase().includes(s) || e.emp_code.toLowerCase().includes(s)) &&
      (!f.dept || e.department === f.dept) && (!f.status || e.status === f.status));
    return html`<div class="stack">
      <div class="row between"><h1 style="margin:0">Employees</h1><span class="muted">${rows.length} of ${emps.length}</span></div>
      <div class="row">
        <input style="width:220px" placeholder="Search name or ID" value=${f.search} onInput=${e => setF({ ...f, search: e.target.value })} />
        <select style="width:190px" value=${f.dept} onChange=${e => setF({ ...f, dept: e.target.value })}>
          <option value="">Department: All</option>${depts.map(d => html`<option>${d}</option>`)}
        </select>
        <select style="width:160px" value=${f.status} onChange=${e => setF({ ...f, status: e.target.value })}>
          <option value="active">Status: Active</option><option value="inactive">Status: Inactive</option><option value="">Status: All</option>
        </select>
        <span class="spacer" />
        ${ctx.can.edit && html`<button onClick=${() => setImporting(true)}>Import from Excel</button><button class="primary" onClick=${() => setAdding(true)}>Add employee</button>`}
      </div>
      <div class="card flush"><div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Structure</th><th class="num">Monthly gross</th><th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map(e => {
          const sl = sal.get(e.id);
          return html`<tr class="click" onClick=${() => navigate(`/employees/${e.id}`)}>
            <td class="mono">${e.emp_code}</td><td>${e.name}<div class="small muted">${e.designation || ''}</div></td>
            <td>${e.department || '–'}</td><td>${sl ? structs.get(sl.structure_id)?.name : html`<span class="muted">Not set</span>`}</td>
            <td class="num">${sl ? fmt(sl.monthly_gross) : '–'}</td>
            <td>${e.status === 'inactive' ? html`<${Badge}>Inactive<//>` : !e.bank_acct || !e.ifsc ? html`<${Badge} kind="warn">Bank details missing<//>` : !sl ? html`<${Badge} kind="bad">No salary<//>` : html`<${Badge} kind="ok">Active<//>`}</td>
          </tr>`;
        }) : html`<tr><td colspan="6" class="empty">No employees match.</td></tr>`}</tbody>
      </table></div></div>
      ${adding && html`<${AddEmployee} ctx=${ctx} emps=${emps} onClose=${() => setAdding(false)} />`}
      ${importing && html`<${ImportEmployees} ctx=${ctx} emps=${emps} structs=${structList} onClose=${() => { setImporting(false); st.reload(); }} />`}
    </div>`;
  }}<//>`;
}

function AddEmployee({ ctx, emps, onClose }) {
  const [e, setE] = useState({ emp_code: nextEmpCode(ctx.company.emp_code_prefix, emps), name: '', email: '', doj: today(), department: '', designation: '' });
  const [busy, act] = useAction();
  const save = () => act(async () => {
    const row = await q(sb.from('employees').insert({ ...e, company_id: ctx.company.id, doj: e.doj || null }).select().single());
    navigate(`/employees/${row.id}/salary`);
  }, 'Employee added, now assign a salary');
  const inp = (k, label, type = 'text') => html`<${Field} label=${label}><input type=${type} value=${e[k]} onInput=${ev => setE({ ...e, [k]: ev.target.value })} /><//>`;
  return html`<${Modal} title="Add employee" onClose=${onClose}>
    <div class="grid g2">${inp('emp_code', 'Employee ID')}${inp('name', 'Full name')}${inp('email', 'Email', 'email')}${inp('doj', 'Date of joining', 'date')}${inp('department', 'Department')}${inp('designation', 'Designation')}</div>
    <div class="row" style="margin-top:16px"><span class="spacer" /><button onClick=${onClose}>Cancel</button><button class="primary" disabled=${busy || !e.name || !e.emp_code} onClick=${save}>Add employee</button></div>
  <//>`;
}

// ---------------------------------------------------------------- Excel import
const IMPORT_COLS = ['emp_code', 'name', 'email', 'phone', 'gender', 'dob', 'doj', 'department', 'designation', 'pan', 'uan', 'esi_no', 'bank_name', 'bank_acct', 'ifsc', 'structure', 'annual_ctc', 'effective_from'];
const ALIASES = { 'employee id': 'emp_code', 'emp id': 'emp_code', 'id': 'emp_code', 'employee name': 'name', 'full name': 'name', 'date of birth': 'dob', 'date of joining': 'doj', 'joining date': 'doj', 'account number': 'bank_acct', 'bank account': 'bank_acct', 'ifsc code': 'ifsc', 'salary structure': 'structure', 'ctc': 'annual_ctc', 'annual ctc': 'annual_ctc' };
const normKey = k => { const s = String(k).trim().toLowerCase(); return ALIASES[s] || s.replace(/[\s-]+/g, '_'); };

function ImportEmployees({ ctx, emps, structs, onClose }) {
  const [report, setReport] = useState(null);
  const [busy, act] = useAction();

  const template = async () => {
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLS, ['', 'Ravi Kumar', 'ravi@example.com', '', 'M', '1994-05-10', '2023-06-12', 'Engineering', 'Software Engineer', 'ABCDE1234F', '100123456789', '', 'HDFC Bank', '50100123456789', 'HDFC0001234', structs[0]?.name || 'Staff', 720000, '2026-04-01']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee-import-template.xlsx');
  };

  const run = file => act(async () => {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const structByName = new Map(structs.map(s => [s.name.toLowerCase(), s]));
    const existing = new Map(emps.map(e => [e.emp_code.toUpperCase(), e]));
    const pool = [...emps];
    const results = [];
    for (let i = 0; i < raw.length; i++) {
      const r = Object.fromEntries(Object.entries(raw[i]).map(([k, v]) => [normKey(k), typeof v === 'string' ? v.trim() : v]));
      const line = i + 2;
      const errs = [];
      if (!r.name) errs.push('name is required');
      for (const k of ['dob', 'doj', 'effective_from']) if (r[k] && !toIsoDate(r[k])) errs.push(`${k} "${r[k]}" is not a date`);
      if (r.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(r.ifsc)) errs.push('IFSC should look like HDFC0001234');
      if (r.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(r.pan)) errs.push('PAN should look like ABCDE1234F');
      let st = null;
      if (r.structure) { st = structByName.get(String(r.structure).toLowerCase()); if (!st) errs.push(`unknown structure "${r.structure}"`); }
      if (r.annual_ctc && isNaN(Number(String(r.annual_ctc).replace(/,/g, '')))) errs.push('annual_ctc must be a number');
      if (errs.length) { results.push({ line, name: r.name, ok: false, msg: errs.join('; ') }); continue; }

      const code = r.emp_code ? String(r.emp_code).toUpperCase() : nextEmpCode(ctx.company.emp_code_prefix, pool);
      const row = { company_id: ctx.company.id, emp_code: code, name: r.name };
      for (const k of ['email', 'phone', 'gender', 'department', 'designation', 'uan', 'esi_no', 'bank_name', 'bank_acct']) if (r[k] !== undefined && r[k] !== '') row[k] = String(r[k]);
      for (const k of ['pan', 'ifsc']) if (r[k]) row[k] = String(r[k]).toUpperCase();
      for (const k of ['dob', 'doj']) if (r[k]) row[k] = toIsoDate(r[k]);
      try {
        const saved = await q(sb.from('employees').upsert(row, { onConflict: 'company_id,emp_code' }).select().single());
        pool.push(saved);
        let msg = existing.has(code) ? 'updated' : 'added';
        if (st && r.annual_ctc) {
          const ctc = Number(String(r.annual_ctc).replace(/,/g, ''));
          await q(sb.from('employee_salaries').insert({ company_id: ctx.company.id, employee_id: saved.id, structure_id: st.id, annual_ctc: ctc, monthly_gross: Math.round(ctc / 12), effective_from: toIsoDate(r.effective_from) || saved.doj || today(), created_by: ctx.user.id }));
          msg += `, salary ₹${fmt(ctc)} CTC`;
        }
        results.push({ line, name: r.name, code, ok: true, msg });
      } catch (e) { results.push({ line, name: r.name, ok: false, msg: e.message }); }
    }
    setReport(results);
  });

  const bad = report?.filter(r => !r.ok) || [];
  return html`<${Modal} title="Import employees from Excel" onClose=${onClose} wide>
    ${!report ? html`<div class="stack">
      <p class="muted" style="margin:0">Upload .xlsx or .csv with a header row. Columns: <span class="mono small">${IMPORT_COLS.join(', ')}</span>. Rows with an existing Employee ID are updated. Include <b>structure</b> + <b>annual_ctc</b> to assign salary.</p>
      <div class="row"><button onClick=${template}>Download template</button>
        <input type="file" accept=".xlsx,.xls,.csv" disabled=${busy} style="width:auto" onChange=${e => e.target.files[0] && run(e.target.files[0])} />
        ${busy && html`<span class="muted">Importing…</span>`}</div>
    </div>` : html`<div class="stack">
      <div class="row"><${Badge} kind="ok">${report.length - bad.length} imported<//>${bad.length ? html`<${Badge} kind="bad">${bad.length} with errors<//>` : ''}
        <span class="spacer" />${bad.length ? html`<button onClick=${() => downloadCSV([['row', 'name', 'error'], ...bad.map(b => [b.line, b.name, b.msg])], 'import-errors.csv')}>Download error report</button>` : ''}</div>
      <div class="card flush" style="max-height:50vh;overflow:auto"><table>
        <thead><tr><th>Row</th><th>Name</th><th>Result</th></tr></thead>
        <tbody>${report.map(r => html`<tr><td class="num">${r.line}</td><td>${r.name || '–'} ${r.code ? html`<span class="mono small muted">${r.code}</span>` : ''}</td><td>${r.ok ? r.msg : html`<span style="color:var(--bad)">${r.msg}</span>`}</td></tr>`)}</tbody>
      </table></div>
      <div class="row"><span class="spacer" /><button class="primary" onClick=${onClose}>Done</button></div>
    </div>`}
  <//>`;
}

// ================================================================ profile
const TABS = [['personal', 'Personal'], ['job', 'Job'], ['bank', 'Bank'], ['statutory', 'Statutory'], ['salary', 'Salary'], ['leaves', 'Leaves'], ['payslips', 'Payslips']];

export function EmployeeProfile({ ctx, id, tab }) {
  const st = useAsync(() => q(sb.from('employees').select('*').eq('id', id).single()), [id]);
  return html`<${Async} state=${st}>${emp => html`<div class="stack">
    <div><a href="#/employees" class="small muted">← Employees</a></div>
    <div class="card">
      <div class="row between">
        <h2 style="margin:0">${emp.name} · <span class="mono">${emp.emp_code}</span></h2>
        <span class="muted">${emp.designation || 'No designation'}${emp.doj ? ` · Joined ${fmtDate(emp.doj)}` : ''}</span>
      </div>
      <div class="tabs" style="margin-top:14px">${TABS.map(([k, l]) => html`<a href=${`#/employees/${id}/${k}`} class=${tab === k ? 'active' : ''}>${l}</a>`)}</div>
      ${tab === 'salary' ? html`<${SalaryTab} ctx=${ctx} emp=${emp} />`
        : tab === 'leaves' ? html`<div class="stack"><p>Leaves and attendance are recorded month by month.</p><div><button onClick=${() => navigate(`/leaves?emp=${emp.id}`)}>Open ${emp.name}'s leave calendar</button></div></div>`
        : tab === 'payslips' ? html`<${EmpPayslips} ctx=${ctx} emp=${emp} />`
        : html`<${DetailsTab} ctx=${ctx} emp=${emp} tab=${tab} onSaved=${st.reload} />`}
    </div>
  </div>`}<//>`;
}

const DETAIL_FIELDS = {
  personal: [['name', 'Full name'], ['email', 'Email', 'email'], ['phone', 'Phone'], ['gender', 'Gender', 'select', ['', 'M', 'F', 'Other']], ['dob', 'Date of birth', 'date'], ['address', 'Address']],
  job: [['emp_code', 'Employee ID'], ['department', 'Department'], ['designation', 'Designation'], ['doj', 'Date of joining', 'date'], ['exit_date', 'Exit date', 'date'], ['status', 'Status', 'select', ['active', 'inactive']]],
  bank: [['bank_name', 'Bank name'], ['bank_acct', 'Account number'], ['ifsc', 'IFSC']],
  statutory: [['pan', 'PAN'], ['uan', 'UAN (PF)'], ['esi_no', 'ESI IP number'],
    ['eps_eligible', 'EPS (pension) member', 'bool', 'Untick for members who joined EPF after 1 Sep 2014 earning above ₹15,000. Employees aged 58+ are excluded automatically.']],
};

function DetailsTab({ ctx, emp, tab, onSaved }) {
  const [e, setE] = useState({ ...emp });
  const [busy, act] = useAction();
  const fields = DETAIL_FIELDS[tab] || DETAIL_FIELDS.personal;
  const custom = e.custom || {};
  const [newKey, setNewKey] = useState('');
  const save = () => act(async () => {
    const patch = Object.fromEntries(fields.map(([k, , type]) => [k, type === 'bool' ? e[k] !== false : (e[k] === '' ? null : e[k])]));
    if (patch.pan) patch.pan = patch.pan.toUpperCase();
    if (patch.ifsc) patch.ifsc = patch.ifsc.toUpperCase();
    if (tab === 'personal') patch.custom = custom;
    await q(sb.from('employees').update(patch).eq('id', emp.id));
    onSaved();
  }, 'Saved');
  const ro = !ctx.can.edit;
  return html`<div class="stack">
    <div class="grid g3">${fields.map(([k, label, type = 'text', opts]) => type === 'bool'
      ? html`<${Field} label=${label} hint=${opts}><label class="check" style="min-height:38px"><input type="checkbox" disabled=${ro} checked=${e[k] !== false} onChange=${ev => setE({ ...e, [k]: ev.target.checked })} /> ${e[k] !== false ? 'Yes' : 'No'}</label><//>`
      : html`<${Field} label=${label}>
      ${type === 'select'
        ? html`<select disabled=${ro} value=${e[k] ?? ''} onChange=${ev => setE({ ...e, [k]: ev.target.value })}>${opts.map(o => html`<option value=${o}>${o || '–'}</option>`)}</select>`
        : html`<input disabled=${ro} type=${type} value=${e[k] ?? ''} onInput=${ev => setE({ ...e, [k]: ev.target.value })} />`}
    <//>`)}</div>
    ${tab === 'personal' && html`<div class="stack">
      <h3 style="margin:8px 0 0">Custom fields</h3>
      <div class="grid g3">${Object.keys(custom).map(k => html`<${Field} label=${k}><input disabled=${ro} value=${custom[k]} onInput=${ev => setE({ ...e, custom: { ...custom, [k]: ev.target.value } })} /><//>`)}</div>
      ${!ro && html`<div class="row"><input style="width:220px" placeholder="New field name (e.g. Blood group)" value=${newKey} onInput=${ev => setNewKey(ev.target.value)} /><button disabled=${!newKey.trim()} onClick=${() => { setE({ ...e, custom: { ...custom, [newKey.trim()]: '' } }); setNewKey(''); }}>Add field</button></div>`}
    </div>`}
    ${tab === 'personal' && ctx.can.admin && e.email && !emp.user_id && html`<${InviteEmployee} ctx=${ctx} emp=${emp} />`}
    ${!ro && html`<div class="row"><span class="spacer" /><button class="primary" disabled=${busy} onClick=${save}>Save</button></div>`}
  </div>`;
}

function InviteEmployee({ ctx, emp }) {
  const [busy, act] = useAction();
  return html`<div class="notice info row">Give ${emp.name} self-service access to their payslips. They must first sign up with ${emp.email}.
    <span class="spacer" /><button class="sm" disabled=${busy} onClick=${() => act(async () => {
      await q(sb.rpc('add_company_user', { p_company: ctx.company.id, p_email: emp.email, p_role: 'employee' }));
    }, 'Employee portal access granted')}>Grant portal access</button></div>`;
}

// ---------------------------------------------------------------- salary tab (screen 4)
function SalaryTab({ ctx, emp }) {
  const cid = ctx.company.id;
  const st = useAsync(async () => {
    const [structs, comps, history, pt] = await Promise.all([
      listStructures(cid), listComponents(cid),
      q(sb.from('employee_salaries').select('*').eq('employee_id', emp.id).order('effective_from', { ascending: false }).order('created_at', { ascending: false })),
      listPtSlabs(cid),
    ]);
    return { structs, comps, history, pt };
  }, [emp.id]);
  return html`<${Async} state=${st}>${d => html`<${SalaryEditor} ctx=${ctx} emp=${emp} ...${d} reload=${st.reload} />`}<//>`;
}

function SalaryEditor({ ctx, emp, structs, comps, history, pt, reload }) {
  const cur = history[0];
  const [f, setF] = useState({
    structure_id: cur?.structure_id || structs[0]?.id || '',
    annual_ctc: cur?.annual_ctc ?? '',
    monthly_gross: cur?.monthly_gross ?? '',
    effective_from: cur ? cur.effective_from : (emp.doj || today()),
    grossTouched: false,
  });
  const [busy, act] = useAction();
  const gross = f.monthly_gross === '' ? Math.round((Number(f.annual_ctc) || 0) / 12) : Number(f.monthly_gross);
  const st = structs.find(s => s.id === f.structure_id);

  const preview = useMemo(() => {
    if (!st || !gross) return null;
    try {
      const mc = mergeComponents(st.structure_components || [], comps);
      const cal = monthCalendar(2026, 1, []);
      const r = calculatePayroll({ company: ctx.company, employee: { dob: emp.dob, eps_eligible: emp.eps_eligible }, salary: { monthly_gross: gross, annual_ctc: Number(f.annual_ctc) || gross * 12 }, comps: mc, cal, ptSlabs: pt });
      return { r, mc };
    } catch (e) { return { error: e.message }; }
  }, [f.structure_id, gross, f.annual_ctc]);

  const save = () => act(async () => {
    if (!f.effective_from) throw new Error('Pick an effective date');
    await q(sb.from('employee_salaries').insert({
      company_id: ctx.company.id, employee_id: emp.id, structure_id: f.structure_id,
      annual_ctc: Number(f.annual_ctc), monthly_gross: gross, effective_from: f.effective_from, created_by: ctx.user.id,
    }));
    reload();
  }, 'Salary saved');

  const ro = !ctx.can.edit;
  const ruleFor = code => { const c = preview?.mc.find(c => c.code === code); return c ? ruleLabel(c, ctx.company) : ''; };
  return html`<div class="stack">
    <div class="grid g4">
      <${Field} label="Salary structure"><select disabled=${ro} value=${f.structure_id} onChange=${e => setF({ ...f, structure_id: e.target.value })}>${structs.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select><//>
      <${Field} label="Annual CTC"><input disabled=${ro} type="number" value=${f.annual_ctc} onInput=${e => setF({ ...f, annual_ctc: e.target.value, monthly_gross: f.grossTouched ? f.monthly_gross : '' })} /><//>
      <${Field} label="Monthly gross" hint="Defaults to CTC ÷ 12"><input disabled=${ro} type="number" value=${f.monthly_gross === '' ? gross || '' : f.monthly_gross} onInput=${e => setF({ ...f, monthly_gross: e.target.value, grossTouched: true })} /><//>
      <${Field} label="Effective from"><input disabled=${ro} type="date" value=${f.effective_from} onInput=${e => setF({ ...f, effective_from: e.target.value })} /><//>
    </div>
    ${preview?.error && html`<div class="notice bad">${preview.error}</div>`}
    ${preview?.r && html`<div class="card flush"><table>
      <thead><tr><th>Component</th><th>Rule</th><th class="num">Monthly</th><th class="num">Annual</th></tr></thead>
      <tbody>
        ${preview.r.earnings.map(e => html`<tr><td>${e.name}</td><td>${ruleFor(e.code)}</td><td class="num">${fmt(e.amount)}</td><td class="num">${fmt(e.amount * 12)}</td></tr>`)}
        <tr class="total"><td>Gross</td><td></td><td class="num">${fmt(preview.r.gross)}</td><td class="num">${fmt(preview.r.gross * 12)}</td></tr>
        <${DeductionRows} r=${preview.r} rule=${d => d.statutory_key === 'er_pf' ? 'Employer share, paid by employee' : ruleFor(d.code)} cols=${3} annual=${true} skipTds=${true} />
        <tr class="total"><td>Take-home (before TDS)</td><td></td><td class="num">${fmt(preview.r.net)}</td><td class="num">${fmt(preview.r.net * 12)}</td></tr>
        <${EmployerRows} r=${preview.r} cols=${3} annual=${true} />
      </tbody>
    </table></div>`}
    ${preview?.r && html`<${ErPfPolicy} company=${ctx.company} />`}
    <div class="row"><span class="small muted">Revising salary keeps the old record; past payslips are not changed.</span><span class="spacer" />
      ${!ro && html`<button class="primary" disabled=${busy || !f.structure_id || !f.annual_ctc} onClick=${save}>Save salary</button>`}</div>
    ${history.length > 0 && html`<div><h3>History</h3><div class="card flush"><table>
      <thead><tr><th>Effective from</th><th>Structure</th><th class="num">Annual CTC</th><th class="num">Monthly gross</th></tr></thead>
      <tbody>${history.map(h => html`<tr><td>${fmtDate(h.effective_from)}</td><td>${structs.find(s => s.id === h.structure_id)?.name || '–'}</td><td class="num">${fmt(h.annual_ctc)}</td><td class="num">${fmt(h.monthly_gross)}</td></tr>`)}</tbody>
    </table></div></div>`}
  </div>`;
}

function EmpPayslips({ ctx, emp }) {
  const st = useAsync(() => q(sb.from('payroll_items').select('*, run:payroll_runs(year, month, status)').eq('employee_id', emp.id)), [emp.id]);
  const [busy, act] = useAction();
  return html`<${Async} state=${st}>${items => {
    const list = items.filter(i => i.run).sort((a, b) => (b.run.year * 12 + b.run.month) - (a.run.year * 12 + a.run.month));
    if (!list.length) return html`<div class="empty">No payroll processed for ${emp.name} yet.</div>`;
    return html`<div class="card flush"><table>
      <thead><tr><th>Month</th><th>Status</th><th class="num">Paid days</th><th class="num">Net pay</th><th></th></tr></thead>
      <tbody>${list.map(i => html`<tr><td>${monthLabel(i.run.year, i.run.month)}</td><td>${i.run.status}</td><td class="num">${i.paid_days}</td><td class="num">${fmt(i.net)}</td>
        <td class="num"><button class="sm" disabled=${busy} onClick=${() => act(async () => {
          const { blob, filename } = await generatePayslipPdf(ctx.company, i, i.run);
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        })}>Download PDF</button></td></tr>`)}</tbody>
    </table></div>`;
  }}<//>`;
}
