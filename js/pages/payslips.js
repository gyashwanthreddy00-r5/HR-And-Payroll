import { html, useState, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Modal, Badge } from '../ui.js';
import { listRuns, listItems } from '../data.js';
import { fmt, monthLabel, ym, parseYm, navigate, amountInWords, fmtDate, downloadBlob, downloadCSV } from '../util.js';
import { generatePayslipPdf, payslipPassword } from '../payslip.js';
import { generateRunPayslips, zipPayslips } from './payroll.js';
import { deductionRows, contributionLines, INFO_NOTE } from './employer.js';

/** Screen 7 — the payslip, as HTML (PDF is generated from the same frozen item). */
export function PayslipView({ company, item, run }) {
  const e = item.employee_json || {};
  const earn = item.earnings_json || [];
  const ded = deductionRows(item.deductions_json || [], item.employer_json || []);
  const hasInfo = ded.some(d => d.info);
  const rows = Math.max(earn.length, ded.length);
  const erLines = contributionLines(item.employer_json || []);
  const recovered = ded.filter(d => d.statutory_key === 'er_pf').reduce((s, d) => s + Number(d.amount), 0);
  return html`<div class="slip">
    <div class="row between" style="align-items:flex-start">
      <div class="row">${company.logo_url && html`<img src=${company.logo_url} alt="" style="height:40px;max-width:120px;object-fit:contain" />`}
        <div><h3>${company.name}</h3><div class="small muted" style="white-space:pre-line">${company.address || ''}</div></div></div>
      <div style="text-align:right"><b>Payslip · ${monthLabel(run.year, run.month)}</b><div class="small muted">${[company.pan && 'PAN ' + company.pan, company.pf_no && 'PF ' + company.pf_no].filter(Boolean).join(' · ')}</div></div>
    </div>
    <div class="kv">
      <div><span class="muted">Employee</span><span>${e.name}</span></div><div><span class="muted">Employee ID</span><span class="mono">${e.emp_code}</span></div>
      <div><span class="muted">Designation</span><span>${e.designation || '–'}</span></div><div><span class="muted">Department</span><span>${e.department || '–'}</span></div>
      <div><span class="muted">Date of joining</span><span>${fmtDate(e.doj)}</span></div><div><span class="muted">PAN</span><span class="mono">${e.pan || '–'}</span></div>
      <div><span class="muted">UAN</span><span class="mono">${e.uan || '–'}</span></div><div><span class="muted">Bank A/c</span><span class="mono">${e.bank_acct || '–'}</span></div>
      <div><span class="muted">Days in month</span><span class="mono">${item.days_in_month}</span></div><div><span class="muted">Paid days / LOP</span><span class="mono">${item.paid_days} / ${item.lop_days}</span></div>
    </div>
    <div class="card flush"><table>
      <thead><tr><th>Earnings</th><th class="num">Amount</th><th>Deductions</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${Array.from({ length: rows }, (_, i) => html`<tr>
          <td>${earn[i]?.name || ''}</td><td class="num">${earn[i] ? fmt(earn[i].amount) : ''}</td>
          ${ded[i]?.info
            ? html`<td class="muted">${ded[i].name} †</td><td class="num muted">(${fmt(ded[i].amount)})</td>`
            : html`<td>${ded[i]?.name || ''}</td><td class="num">${ded[i] ? fmt(ded[i].amount) : ''}</td>`}</tr>`)}
        <tr class="total"><td>Total earnings</td><td class="num">${fmt(item.earned_gross)}</td><td>${hasInfo ? 'Total deducted from pay' : 'Total deductions'}</td><td class="num">${fmt(item.total_deductions)}</td></tr>
      </tbody>
    </table></div>
    ${hasInfo && html`<p class="small muted" style="margin:6px 0 0">${INFO_NOTE}</p>`}
    <div class="net">Net pay ₹${fmt(item.net)}</div>
    <div class="small muted">Rupees ${amountInWords(item.net)} only${Number(item.lop_amount) > 0 ? ` · Monthly gross ₹${fmt(item.gross)} less LOP ₹${fmt(item.lop_amount)}` : ''}</div>
    ${(erLines.length > 0 || hasInfo) && html`<div class="card flush" style="margin-top:14px"><table>
      <thead><tr><th>Employer contributions <span style="text-transform:none;letter-spacing:0;font-weight:400">(for information, not deducted from your pay)</span></th><th class="num">Wages</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${erLines.map(l => html`<tr><td>${l.name}</td><td class="num">${l.wages ? fmt(l.wages) : '–'}</td><td class="num">${fmt(l.amount)}</td></tr>`)}
        <tr class="total"><td>Total employer contribution${hasInfo ? ' (incl. Employer EPF †)' : ''}</td><td></td><td class="num">${fmt(item.employer_total)}</td></tr>
        <tr><td>Cost to company this month</td><td></td><td class="num">${fmt(Number(item.earned_gross) + Number(item.employer_total || 0))}</td></tr>
      </tbody>
    </table></div>`}
    ${recovered > 0 && html`<p class="small muted" style="margin:8px 0 0">Employer EPF and EPS (₹${fmt(recovered)}) are borne by you as per company policy. They're deducted under Deductions, separate from your own PF, and remitted to your PF account as the employer share.</p>`}
  </div>`;
}

export function Payslips({ ctx, month }) {
  const company = ctx.company;
  const runsSt = useAsync(() => listRuns(company.id), [company.id]);
  return html`<${Async} state=${runsSt}>${runs => {
    if (!runs.length) return html`<div class="stack"><h1>Payslips</h1><div class="empty">No payroll runs yet. <a href="#/payroll">Run payroll</a> first.</div></div>`;
    const sel = month ? runs.find(r => ym(r.year, r.month) === month) : runs[0];
    return html`<div class="stack">
      <div class="row between"><h1 style="margin:0">Payslips</h1>
        <select style="width:220px" value=${sel ? ym(sel.year, sel.month) : ''} onChange=${e => navigate('/payslips/' + e.target.value)}>
          ${!sel && html`<option value="">Select month</option>`}
          ${runs.map(r => html`<option value=${ym(r.year, r.month)}>${monthLabel(r.year, r.month)} · ${r.status}</option>`)}
        </select></div>
      ${sel ? html`<${RunPayslips} key=${sel.id} ctx=${ctx} run=${sel} />` : html`<div class="empty">No payroll for ${month}.</div>`}
    </div>`;
  }}<//>`;
}

function RunPayslips({ ctx, run }) {
  const company = ctx.company;
  const st = useAsync(async () => {
    const items = await listItems(run.id);
    const slips = items.length ? await q(sb.from('payslips').select('*').in('payroll_item_id', items.map(i => i.id))) : [];
    return { items: items.sort((a, b) => (a.employee_json?.emp_code || '').localeCompare(b.employee_json?.emp_code || '')), slips: new Map(slips.map(s => [s.payroll_item_id, s])) };
  }, [run.id]);
  const [busy, act] = useAction();
  const [progress, setProgress] = useState('');
  const [viewing, setViewing] = useState(null);
  const locked = run.status === 'locked';

  const one = item => act(async () => { const p = await generatePayslipPdf(company, item, run); downloadBlob(p.blob, p.filename); });
  const all = items => act(async () => {
    const pdfs = await generateRunPayslips(company, run, items, (i, t) => setProgress(`Generating ${i} / ${t}…`));
    setProgress('Zipping…');
    await zipPayslips(pdfs, `Payslips-${ym(run.year, run.month)}.zip`);
    setProgress(''); st.reload();
  }, 'ZIP downloaded').finally(() => setProgress(''));
  const mailMerge = items => downloadCSV([['emp_code', 'name', 'email', 'net_pay', 'payslip_file', 'pdf_password_hint'],
    ...items.map(i => [i.employee_json?.emp_code, i.employee_json?.name, i.employee_json?.email, i.net,
      `Payslip-${i.employee_json?.emp_code}-${ym(run.year, run.month)}.pdf`,
      payslipPassword(company, i.employee_json || {}) ? (company.payslip_template?.password === 'dob' ? 'Date of birth DDMMYYYY' : 'PAN in capitals') : ''])],
    `payslip-mailing-${ym(run.year, run.month)}.csv`);

  return html`<${Async} state=${st}>${({ items, slips }) => html`<div class="stack">
    ${!locked && html`<div class="notice">This run is <b>${run.status}</b>. Payslips are final only after you lock it in <a href=${`#/payroll/${ym(run.year, run.month)}`}>Run payroll</a>. Downloads below are drafts.</div>`}
    <div class="row">
      <span class="muted">${items.length} employees · ${[...slips.values()].length} generated</span>
      <span class="spacer" />${progress && html`<span class="muted">${progress}</span>`}
      <button disabled=${busy || !items.length} onClick=${() => mailMerge(items)} title="Bulk email needs an SMTP provider; use this list with your mail tool meanwhile">Mailing list (CSV)</button>
      <button class="primary" disabled=${busy || !items.length || !locked} onClick=${() => all(items)}>Download all (ZIP)</button>
    </div>
    <div class="card flush"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Email</th><th class="num">Net pay</th><th class="num">Employer PF</th><th>PDF</th><th></th></tr></thead>
      <tbody>${items.map(i => { const s = slips.get(i.id); return html`<tr>
        <td class="mono">${i.employee_json?.emp_code}</td><td>${i.employee_json?.name}</td><td class="small">${i.employee_json?.email || html`<span class="muted">no email</span>`}</td>
        <td class="num">${fmt(i.net)}</td>
        <td class="num">${(() => { const pf = (i.employer_json || []).filter(l => l.head === 'pf').reduce((a, l) => a + Number(l.amount), 0);
          if (!pf) return html`<span class="muted">–</span>`;
          const byEmp = (i.employer_json || []).some(l => l.borne_by === 'employee');
          return html`${fmt(pf)} <div class="small muted">${byEmp ? 'deducted from pay' : 'paid by company'}</div>`; })()}</td>
        <td>${s ? html`<${Badge} kind="ok">Generated<//>` : html`<${Badge}>Not yet<//>`}</td>
        <td class="num"><button class="sm" onClick=${() => setViewing(i)}>View</button> <button class="sm" disabled=${busy} onClick=${() => one(i)}>PDF</button></td>
      </tr>`; })}</tbody>
    </table></div>
    ${company.payslip_template?.password && company.payslip_template.password !== 'none' && html`<p class="small muted">PDFs are password-protected with the employee's ${company.payslip_template.password === 'dob' ? 'date of birth (DDMMYYYY)' : 'PAN'}. Employees without one get an unprotected PDF.</p>`}
    ${viewing && html`<${Modal} title="Payslip" wide onClose=${() => setViewing(null)}><${PayslipView} company=${company} item=${viewing} run=${run} /><div class="row" style="margin-top:12px"><span class="spacer" /><button class="primary" onClick=${() => one(viewing)}>Download PDF</button></div><//>`}
  </div>`}<//>`;
}
