import { html, useState, sb, q, loadJSZip } from '../lib.js';
import { useAsync, Async, useAction, Field, Modal, Badge } from '../ui.js';
import { loadPayrollContext, getRun, listItems, itemRow, runTotals, employerCost, employerAmt, recoveredPf } from '../data.js';
import { ErPfPolicy, erPfSummary, policyChanged } from './employer.js';
import { fmt, money, monthLabel, ym, parseYm, navigate, prevMonth, nextMonth, downloadBlob, toast } from '../util.js';
import { generatePayslipPdf } from '../payslip.js';

const dedOf = (item, key) => (item.deductions_json || []).filter(d => d.statutory_key === key).reduce((s, d) => s + Number(d.amount), 0);
const epsFromPay = item => (item.deductions_json || []).filter(d => d.code === 'ER_EPS_EE').reduce((s, d) => s + Number(d.amount), 0);
const adjNet = item => {
  const a = item.adjustments_json || {};
  return (a.additions || []).reduce((s, x) => s + Number(x.amount || 0), 0) - (a.deductions || []).reduce((s, x) => s + Number(x.amount || 0), 0);
};

/** Generate (and store) payslip PDFs for every item of a locked run. Returns the PDFs. */
export async function generateRunPayslips(company, run, items, onProgress) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const pdf = await generatePayslipPdf(company, it, run);
    const path = `${company.id}/${ym(run.year, run.month)}/${pdf.filename}`;
    const { error } = await sb.storage.from('payslips').upload(path, pdf.blob, { upsert: true, contentType: 'application/pdf' });
    if (error) throw new Error(`Upload failed for ${it.employee_json?.emp_code}: ${error.message}`);
    await q(sb.from('payslips').upsert({ company_id: company.id, payroll_item_id: it.id, pdf_path: path, generated_at: new Date().toISOString() }, { onConflict: 'payroll_item_id' }));
    out.push(pdf);
    onProgress && onProgress(i + 1, items.length);
  }
  return out;
}

export async function zipPayslips(pdfs, name) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  for (const p of pdfs) zip.file(p.filename, p.blob);
  downloadBlob(await zip.generateAsync({ type: 'blob' }), name);
}

/** Screen 6 — compute everyone, review the register, adjust, lock & generate. */
export function Payroll({ ctx, month: mParam }) {
  const { year, month } = parseYm(mParam);
  const company = ctx.company;
  const st = useAsync(async () => {
    const run = await getRun(company.id, year, month);
    const items = run ? await listItems(run.id) : [];
    return { run, items };
  }, [company.id, year, month]);
  const [busy, act] = useAction();
  const [progress, setProgress] = useState('');
  const [adjusting, setAdjusting] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const p = prevMonth(year, month), n = nextMonth(year, month);

  /** (Re)compute all employees, keeping any one-time adjustments already entered. */
  const runPayroll = existing => act(async () => {
    setProgress('Calculating…');
    const pc = await loadPayrollContext(company, year, month);
    const prevAdj = new Map((existing?.items || []).map(i => [i.employee_id, i.adjustments_json]));
    let run = existing?.run;
    if (!run) run = await q(sb.from('payroll_runs').insert({ company_id: company.id, year, month, status: 'draft' }).select().single());
    const rows = [], skip = [];
    for (const emp of pc.inScope) {
      const adj = prevAdj.get(emp.id);
      const r = pc.compute(emp, adj);
      if (r.error) { skip.push({ emp, error: r.error }); continue; }
      rows.push(itemRow(company, run.id, emp, r.structure, r.result, adj));
    }
    await q(sb.from('payroll_items').delete().eq('run_id', run.id));
    if (rows.length) await q(sb.from('payroll_items').insert(rows));
    await q(sb.from('payroll_runs').update({ status: 'processed', totals: runTotals(rows), run_by: ctx.user.id, run_at: new Date().toISOString() }).eq('id', run.id));
    setSkipped(skip);
    setProgress('');
    st.reload();
  }, `Payroll calculated for ${monthLabel(year, month)}`);

  const lockAndGenerate = ({ run, items }) => {
    if (!confirm(`Lock ${monthLabel(year, month)} payroll for ${items.length} employees and generate payslips? Locked payroll can't be edited unless an admin unlocks it.`)) return;
    act(async () => {
      await q(sb.from('payroll_runs').update({ status: 'locked', locked_by: ctx.user.id, locked_at: new Date().toISOString(), totals: runTotals(items) }).eq('id', run.id));
      const pdfs = await generateRunPayslips(company, { ...run, status: 'locked' }, items, (i, t) => setProgress(`Generating payslips ${i} / ${t}…`));
      setProgress('Zipping…');
      await zipPayslips(pdfs, `Payslips-${ym(year, month)}.zip`);
      setProgress('');
      st.reload();
    }, 'Payroll locked and payslips generated').finally(() => setProgress(''));
  };

  const unlock = run => confirm('Unlock this payroll run? Payslips already sent will not be recalled.') &&
    act(async () => { await q(sb.from('payroll_runs').update({ status: 'processed', locked_by: null, locked_at: null }).eq('id', run.id)); st.reload(); }, 'Unlocked');
  const discard = run => confirm('Delete this draft payroll run?') &&
    act(async () => { await q(sb.from('payroll_runs').delete().eq('id', run.id)); setSkipped([]); st.reload(); }, 'Draft deleted');

  return html`<${Async} state=${st}>${data => {
    const { run, items } = data;
    const locked = run?.status === 'locked';
    const sorted = items.slice().sort((a, b) => (a.employee_json?.emp_code || '').localeCompare(b.employee_json?.emp_code || ''));
    const t = runTotals(items);
    const showRec = t.employer_pf_recovered > 0;
    return html`<div class="stack">
      <div class="row between">
        <div class="row"><h1 style="margin:0">${monthLabel(year, month)} payroll</h1>
          ${run ? html`<${Badge} kind=${locked ? 'ok' : 'warn'}>${run.status}<//>` : html`<${Badge}>not run<//>`}</div>
        <div class="row">
          <button class="sm" onClick=${() => navigate(`/payroll/${ym(p.year, p.month)}`)}>‹ ${monthLabel(p.year, p.month)}</button>
          <input type="month" style="width:170px" value=${ym(year, month)} onChange=${e => e.target.value && navigate('/payroll/' + e.target.value)} />
          <button class="sm" onClick=${() => navigate(`/payroll/${ym(n.year, n.month)}`)}>${monthLabel(n.year, n.month)} ›</button>
        </div>
      </div>

      ${!run && html`<div class="card stack">
        <p style="margin:0">Calculates salary for every active employee from their structure, this month's leaves and the company's LOP rule (<b>${{ calendar: 'calendar days', fixed30: 'fixed 30 days', working: 'working days' }[company.lop_basis]}</b>). You can review and adjust before locking.</p>
        <${ErPfPolicy} company=${company} />
        <div><button class="primary" disabled=${busy} onClick=${() => runPayroll(null)}>${progress || `Run ${monthLabel(year, month).split(' ')[0]} payroll`}</button></div>
      </div>`}

      ${run && !locked && policyChanged(company, items) && html`<div class="notice row">Employer PF settings changed after this run was calculated (now: ${erPfSummary(company)}).
        <span class="spacer" /><button class="sm" disabled=${busy} onClick=${() => runPayroll(data)}>Re-run to apply</button></div>`}
      ${run && locked && html`<p class="small muted" style="margin:0">Locked payroll keeps the Employer PF treatment it was calculated with. Today's setting: ${erPfSummary(company)}.</p>`}
      ${skipped.length > 0 && html`<div class="notice">Skipped ${skipped.length}: ${skipped.map(s => html`<a href=${`#/employees/${s.emp.id}/salary`}>${s.emp.name}</a> (${s.error}) `)}</div>`}

      ${run && html`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="card stat"><div class="label">Employees</div><div class="value">${t.employees}</div></div>
        <div class="card stat"><div class="label">Earned gross</div><div class="value">${money(t.earned_gross)}</div></div>
        <div class="card stat"><div class="label">Deductions</div><div class="value">${money(t.deductions)}</div></div>
        <div class="card stat"><div class="label">Net payout</div><div class="value">${money(t.net)}</div></div>
        <div class="card stat" title="Employer contributions the company bears (EPF + EPS when paid by the company, EDLI, admin charges)"><div class="label">Employer PF & charges</div><div class="value">${money(t.employer_total)}</div></div>
        ${t.employer_pf_recovered > 0 && html`<div class="card stat" title="Employer EPF + EPS share deducted from employees' pay (EPF paid by: Employee)"><div class="label">Employer PF borne by employees</div><div class="value">${money(t.employer_pf_recovered)}</div></div>`}
        <div class="card stat" title="Earned gross + employer contributions"><div class="label">Total payroll cost</div><div class="value">${money(t.payroll_cost)}</div></div>
      </div>`}

      ${run && html`<div class="card flush"><div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Name</th><th class="num">Paid days</th><th class="num">LOP</th><th class="num">Gross</th><th class="num">LOP amt</th><th class="num" title="Employee's own PF deduction">Employee PF</th><th class="num" title="Employer EPF: deducted from pay when paid by the employee; shown for information when paid by the company">Employer EPF</th>${showRec && html`<th class="num" title="Employer EPS deducted from pay (EPF paid by: Employee)">Employer EPS (from pay)</th>`}<th class="num">ESI</th><th class="num">PT</th><th class="num">TDS</th><th class="num">One-time</th><th class="num">Net pay</th><th class="num" title="Employer EPF + EPS borne by the company (not deducted from net)">Employer PF</th><th class="num" title="Earned gross + all employer contributions">Cost to company</th></tr></thead>
        <tbody>${sorted.map(i => html`<tr class=${locked ? '' : 'click'} onClick=${() => !locked && setAdjusting(i)} title=${locked ? '' : 'Click to adjust TDS / one-time items'}>
          <td class="mono">${i.employee_json?.emp_code}</td><td>${i.employee_json?.name}</td>
          <td class="num">${fmt(i.paid_days)} / ${fmt(i.days_in_month)}</td><td class="num">${fmt(i.lop_days)}</td>
          <td class="num">${fmt(i.gross)}</td><td class="num">${i.lop_amount ? '−' + fmt(i.lop_amount) : '–'}</td>
          <td class="num">${fmt(dedOf(i, 'pf'))}</td>
          <td class="num">${(() => { const a = employerAmt(i, 'ER_EPF'); if (!a) return '–';
            const fromPay = (i.employer_json || []).some(l => l.code === 'ER_EPF' && l.borne_by === 'employee');
            return html`<span class=${fromPay ? '' : 'muted'}>${fromPay ? fmt(a) : `(${fmt(a)})`}</span><div class="small muted">${fromPay ? 'from pay' : 'company'}</div>`; })()}</td>
          ${showRec && html`<td class="num">${epsFromPay(i) ? fmt(epsFromPay(i)) : '–'}</td>`}<td class="num">${fmt(dedOf(i, 'esi'))}</td><td class="num">${fmt(dedOf(i, 'pt'))}</td>
          <td class="num">${dedOf(i, 'tds') ? fmt(dedOf(i, 'tds')) : html`<span class="muted">0</span>`}</td>
          <td class="num">${adjNet(i) ? (adjNet(i) > 0 ? '+' : '−') + fmt(Math.abs(adjNet(i))) : '–'}</td>
          <td class="num"><b>${fmt(i.net)}</b></td>
          <td class="num muted">${employerCost(i, 'ER_EPF', 'ER_EPS') ? fmt(employerCost(i, 'ER_EPF', 'ER_EPS')) : '–'}</td>
          <td class="num muted">${fmt(Number(i.earned_gross) + Number(i.employer_total || 0))}</td>
        </tr>`)}
        <tr class="total"><td></td><td>Total</td><td></td><td class="num">${fmt(t.lop_days)}</td><td class="num">${fmt(t.gross)}</td><td class="num">−${fmt(items.reduce((s, i) => s + Number(i.lop_amount), 0))}</td>
          <td class="num">${fmt(t.pf)}</td><td class="num">${fmt(t.employer_epf)}</td>
          ${showRec && html`<td class="num">${fmt(items.reduce((s, i) => s + epsFromPay(i), 0))}</td>`}<td class="num">${fmt(t.esi)}</td><td class="num">${fmt(t.pt)}</td><td class="num">${fmt(t.tds)}</td><td class="num">${fmt(items.reduce((s, i) => s + adjNet(i), 0))}</td><td class="num">${fmt(t.net)}</td><td class="num">${fmt(t.employer_pf_company)}</td><td class="num">${fmt(t.payroll_cost)}</td></tr>
        </tbody>
      </table></div></div>`}

      ${run && html`<div class="row">
        ${!locked && html`<button class="danger" disabled=${busy} onClick=${() => discard(run)}>Delete draft</button>
          <button disabled=${busy} onClick=${() => runPayroll(data)}>Re-run calculation</button>`}
        ${locked && html`<span class="muted small">Locked ${run.locked_at ? new Date(run.locked_at).toLocaleString('en-IN') : ''}</span>`}
        <span class="spacer" />
        ${progress && html`<span class="muted">${progress}</span>`}
        ${locked ? html`
          ${ctx.can.admin && html`<button disabled=${busy} onClick=${() => unlock(run)}>Unlock</button>`}
          <button disabled=${busy} onClick=${() => navigate(`/payslips/${ym(year, month)}`)}>View payslips</button>
          <button disabled=${busy} onClick=${() => navigate(`/reports/${ym(year, month)}`)}>Reports & bank file</button>`
        : html`<button class="primary" disabled=${busy || !items.length} onClick=${() => lockAndGenerate(data)}>Lock & generate payslips</button>`}
      </div>`}
      ${!locked && run && html`<p class="small muted">Leaves or salaries changed? Click <b>Re-run calculation</b>. One-time items and TDS you've entered are kept.</p>`}
      ${adjusting && html`<${AdjustModal} ctx=${ctx} item=${adjusting} year=${year} month=${month} run=${run} onClose=${() => setAdjusting(null)} onSaved=${() => { setAdjusting(null); st.reload(); }} />`}
    </div>`;
  }}<//>`;
}

function AdjustModal({ ctx, item, year, month, run, onClose, onSaved }) {
  const a0 = item.adjustments_json || {};
  const [a, setA] = useState({ tds: a0.tds || 0, additions: a0.additions?.length ? a0.additions : [], deductions: a0.deductions?.length ? a0.deductions : [] });
  const [busy, act] = useAction();
  const save = () => act(async () => {
    const pc = await loadPayrollContext(ctx.company, year, month);
    const emp = pc.employees.find(e => e.id === item.employee_id);
    const clean = { tds: Number(a.tds) || 0, additions: a.additions.filter(x => Number(x.amount)), deductions: a.deductions.filter(x => Number(x.amount)) };
    const r = pc.compute(emp, clean);
    if (r.error) throw new Error(r.error);
    const row = itemRow(ctx.company, run.id, emp, r.structure, r.result, clean);
    await q(sb.from('payroll_items').update(row).eq('id', item.id));
    const items = await listItems(run.id);
    await q(sb.from('payroll_runs').update({ totals: runTotals(items) }).eq('id', run.id));
    onSaved();
  }, 'Adjustments saved');

  const list = (key, label) => html`<div class="stack">
    <div class="row between"><b>${label}</b><button class="sm" onClick=${() => setA({ ...a, [key]: [...a[key], { label: '', amount: '' }] })}>+ Add</button></div>
    ${a[key].length === 0 && html`<span class="small muted">None</span>`}
    ${a[key].map((x, i) => html`<div class="row">
      <input style="flex:2" placeholder=${key === 'additions' ? 'Bonus, arrears, reimbursement…' : 'Advance recovery, fine…'} value=${x.label} onInput=${e => setA({ ...a, [key]: a[key].map((y, j) => j === i ? { ...y, label: e.target.value } : y) })} />
      <input style="flex:1" type="number" placeholder="Amount" value=${x.amount} onInput=${e => setA({ ...a, [key]: a[key].map((y, j) => j === i ? { ...y, amount: e.target.value } : y) })} />
      <button class="sm danger" onClick=${() => setA({ ...a, [key]: a[key].filter((_, j) => j !== i) })}>×</button>
    </div>`)}
  </div>`;
  return html`<${Modal} title=${`${item.employee_json?.name} · ${monthLabel(year, month)}`} onClose=${onClose}>
    <div class="stack">
      <div class="small muted">Paid days ${item.paid_days} / ${item.days_in_month} · Earned gross ₹${fmt(item.earned_gross)} · Current net ₹${fmt(item.net)}</div>
      ${(item.employer_json || []).length > 0 && html`<div class="small muted">Employer PF ₹${fmt(employerAmt(item, 'ER_EPF', 'ER_EPS'))}${recoveredPf(item) ? ` deducted from pay (paid by employee)` : ' paid by the company'}${employerCost(item, 'ER_EDLI', 'ER_ADMIN') ? ` · EDLI + admin ₹${fmt(employerCost(item, 'ER_EDLI', 'ER_ADMIN'))} (company)` : ''} · Cost to company ₹${fmt(Number(item.earned_gross) + Number(item.employer_total || 0))}</div>`}
      <${Field} label="TDS for this month (₹)"><input type="number" value=${a.tds} onInput=${e => setA({ ...a, tds: e.target.value })} /><//>
      ${list('additions', 'One-time additions')}
      ${list('deductions', 'One-time deductions')}
      <div class="row"><span class="spacer" /><button onClick=${onClose}>Cancel</button><button class="primary" disabled=${busy} onClick=${save}>Save & recalculate</button></div>
    </div>
  <//>`;
}
