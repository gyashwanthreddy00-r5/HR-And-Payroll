import { html, useState, sb, q, loadXLSX } from '../lib.js';
import { useAsync, Async, useAction } from '../ui.js';
import { listRuns, listItems, listEmployees, listSalaries, listStructures, salaryMap, employerAmt, employerCost, recoveredPf, listComponents, listPtSlabs } from '../data.js';
import { calculatePayroll, mergeComponents, monthCalendar } from '../engine.js';
import { paidByLabel, ErPfPolicy } from './employer.js';
import { fmt, monthLabel, ym, navigate, downloadCSV, MONTHS } from '../util.js';

const ded = (i, key) => (i.deductions_json || []).filter(d => d.statutory_key === key).reduce((s, d) => s + Number(d.amount), 0);
const basicOf = i => (i.earnings_json || []).find(e => e.is_basic)?.amount || 0;

const REPORTS = {
  register: { label: 'Salary register', build: ({ items }) => {
    const codes = []; const seen = new Set();
    for (const i of items) for (const e of i.earnings_json || []) if (!seen.has('E' + e.name)) { seen.add('E' + e.name); codes.push(['E', e.name]); }
    for (const i of items) for (const d of i.deductions_json || []) if (!seen.has('D' + d.name)) { seen.add('D' + d.name); codes.push(['D', d.name]); }
    const head = ['Emp ID', 'Name', 'Department', 'Days', 'Paid days', 'LOP days', 'Monthly gross', ...codes.map(c => c[1]), 'Earned gross', 'Total deductions', 'Net pay',
      'Employer EPF', 'Employer EPF treatment', 'Employer EPS (remitted)', 'EDLI', 'EPF admin', 'Employer cost', 'Payroll cost'];
    const rows = items.map(i => [i.employee_json.emp_code, i.employee_json.name, i.employee_json.department || '', i.days_in_month, i.paid_days, i.lop_days, i.gross,
      ...codes.map(([t, n]) => ((t === 'E' ? i.earnings_json : i.deductions_json) || []).filter(x => x.name === n).reduce((s, x) => s + Number(x.amount), 0)),
      i.earned_gross, i.total_deductions, i.net,
      employerAmt(i, 'ER_EPF'),
      !employerAmt(i, 'ER_EPF') ? '' : (i.employer_json || []).some(l => l.code === 'ER_EPF' && l.borne_by === 'employee') ? 'Deducted from pay' : 'Paid by company (not deducted)',
      employerAmt(i, 'ER_EPS'), employerAmt(i, 'ER_EDLI'), employerAmt(i, 'ER_ADMIN'),
      Number(i.employer_total || 0), Number(i.earned_gross) + Number(i.employer_total || 0)]);
    const tot = head.map((_, k) => k < 3 ? (k === 1 ? 'TOTAL' : '') : rows.some(r => typeof r[k] === 'string') ? '' : rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    return [head, ...rows, tot];
  } },
  bank: { label: 'Bank transfer file', build: ({ items, run }) => [
    ['Beneficiary name', 'Account number', 'IFSC', 'Amount', 'Narration', 'Emp ID'],
    ...items.filter(i => Number(i.net) > 0).map(i => [i.employee_json.name, i.employee_json.bank_acct || 'MISSING', i.employee_json.ifsc || 'MISSING', i.net, `Salary ${MONTHS[run.month - 1].slice(0, 3)} ${run.year}`, i.employee_json.emp_code]),
  ] },
  pf: { label: 'PF summary (ECR)', build: ({ items, company }) => [
    ['UAN', 'Member name', 'Gross wages', 'EPF wages', 'EPS wages', 'EDLI wages', 'EE share (EPF)', 'ER share (EPS 8.33%)', 'ER share (EPF diff)', 'EDLI', 'EPF admin', 'NCP days'],
    ...items.filter(i => ded(i, 'pf') > 0 || employerAmt(i, 'ER_EPF', 'ER_EPS') > 0).map(i => {
      const line = code => (i.employer_json || []).find(l => l.code === code);
      if ((i.employer_json || []).length) {
        const epfW = line('ER_EPF')?.wages ?? Math.min(basicOf(i), Number(company.er_pf_cap || company.pf_cap));
        return [i.employee_json.uan || '', i.employee_json.name, i.earned_gross, epfW, line('ER_EPS')?.wages || 0, line('ER_EDLI')?.wages || 0,
          ded(i, 'pf'), employerAmt(i, 'ER_EPS'), employerAmt(i, 'ER_EPF'), employerAmt(i, 'ER_EDLI'), employerAmt(i, 'ER_ADMIN'), i.lop_days];
      }
      // Runs processed before Employer PF was configured: estimate the statutory split.
      const epf = Math.min(basicOf(i), Number(company.pf_cap));
      const eps = Math.round(Math.min(epf, 15000) * 0.0833);
      return [i.employee_json.uan || '', i.employee_json.name, i.earned_gross, epf, epf, epf, ded(i, 'pf'), eps, ded(i, 'pf') - eps, '', '', i.lop_days];
    }),
  ] },
  employer: { label: 'Employer cost', build: ({ items }) => {
    // Company-borne amounts only; a share recovered from the employee is listed separately, never in cost.
    const rows = items.map(i => [i.employee_json.emp_code, i.employee_json.name, i.earned_gross,
      employerCost(i, 'ER_EPF'), employerCost(i, 'ER_EPS'), employerAmt(i, 'ER_EDLI'), employerAmt(i, 'ER_ADMIN'),
      Number(i.employer_total || 0), Number(i.earned_gross) + Number(i.employer_total || 0), recoveredPf(i)]);
    const tot = ['', 'TOTAL', ...[2, 3, 4, 5, 6, 7, 8, 9].map(k => rows.reduce((s, r) => s + Number(r[k]), 0))];
    return [['Emp ID', 'Name', 'Earned gross', 'Employer EPF (company)', 'Employer EPS (company)', 'EDLI', 'EPF admin', 'Employer cost', 'Payroll cost', 'Employer PF borne by employee'], ...rows, tot];
  } },
  esi: { label: 'ESI summary', build: ({ items }) => [
    ['IP number', 'Name', 'Paid days', 'Wages', 'EE contribution (0.75%)', 'ER contribution (3.25%)'],
    ...items.filter(i => ded(i, 'esi') > 0).map(i => [i.employee_json.esi_no || '', i.employee_json.name, i.paid_days, i.earned_gross, ded(i, 'esi'), Math.ceil(Number(i.earned_gross) * 0.0325)]),
  ] },
  pt: { label: 'Professional Tax', build: ({ items }) => [
    ['Emp ID', 'Name', 'Earned gross', 'PT'],
    ...items.filter(i => ded(i, 'pt') > 0).map(i => [i.employee_json.emp_code, i.employee_json.name, i.earned_gross, ded(i, 'pt')]),
  ] },
  ytd: { label: 'Year to date', build: ({ ytd, run }) => {
    const fyStart = run.month >= 4 ? run.year : run.year - 1;
    const by = new Map();
    for (const i of ytd) {
      const r = by.get(i.employee_id) || { code: i.employee_json.emp_code, name: i.employee_json.name, months: 0, gross: 0, pf: 0, erRec: 0, pt: 0, tds: 0, ded: 0, net: 0, erCo: 0, erCost: 0 };
      r.months++; r.gross += Number(i.earned_gross); r.pf += ded(i, 'pf'); r.erRec += recoveredPf(i); r.pt += ded(i, 'pt'); r.tds += ded(i, 'tds');
      r.ded += Number(i.total_deductions); r.net += Number(i.net);
      r.erCo += employerCost(i, 'ER_EPF', 'ER_EPS'); r.erCost += Number(i.employer_total || 0);
      by.set(i.employee_id, r);
    }
    return [[`Emp ID`, 'Name', `Months (FY ${fyStart}-${String(fyStart + 1).slice(2)})`, 'Gross', 'Employee PF', 'Employer PF borne by employee', 'PT', 'TDS', 'Total deductions', 'Net paid',
      'Employer PF (company)', 'Employer cost', 'Payroll cost'],
      ...[...by.values()].sort((a, b) => a.code.localeCompare(b.code)).map(r => [r.code, r.name, r.months, r.gross, r.pf, r.erRec, r.pt, r.tds, r.ded, r.net, r.erCo, r.erCost, r.gross + r.erCost])];
  } },
  ctc: { label: 'CTC report', build: ({ ctcRows }) => ctcRows },
};

export function Reports({ ctx, month }) {
  const company = ctx.company;
  const runsSt = useAsync(() => listRuns(company.id), [company.id]);
  const [kind, setKind] = useState('register');
  return html`<${Async} state=${runsSt}>${runs => {
    const sel = month ? runs.find(r => ym(r.year, r.month) === month) : runs[0];
    return html`<div class="stack">
      <div class="row between"><h1 style="margin:0">Reports</h1>
        ${runs.length > 0 && html`<select style="width:220px" value=${sel ? ym(sel.year, sel.month) : ''} onChange=${e => navigate('/reports/' + e.target.value)}>
          ${runs.map(r => html`<option value=${ym(r.year, r.month)}>${monthLabel(r.year, r.month)} · ${r.status}</option>`)}</select>`}</div>
      <div class="tabs">${Object.entries(REPORTS).map(([k, r]) => html`<button class=${kind === k ? 'active' : ''} onClick=${() => setKind(k)}>${r.label}</button>`)}</div>
      ${kind === 'ctc' ? html`<${ReportBody} key="ctc" ctx=${ctx} kind=${kind} run=${sel || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }} />`
        : sel ? html`<${ReportBody} key=${sel.id + kind} ctx=${ctx} kind=${kind} run=${sel} />`
        : html`<div class="empty">No payroll runs yet.</div>`}
    </div>`;
  }}<//>`;
}

function ReportBody({ ctx, kind, run }) {
  const company = ctx.company;
  const st = useAsync(async () => {
    if (kind === 'ctc') {
      const [emps, sals, structs, comps, pt] = await Promise.all([listEmployees(company.id), listSalaries(company.id), listStructures(company.id), listComponents(company.id), listPtSlabs(company.id)]);
      const sm = salaryMap(sals, '9999-12-31'); const sById = new Map(structs.map(s => [s.id, s]));
      // Full-month figures from today's Pay rules (no leave), so CTC reflects the current Employer PF policy.
      const cal = monthCalendar(run.year, run.month, company.weekly_offs || [0, 6]);
      return { ctcRows: [['Emp ID', 'Name', 'Department', 'Designation', 'Structure', 'Annual CTC', 'Monthly gross', 'Effective from',
          'Employer PF / month', 'Employer PF paid by', 'Employer cost / month', 'Cost to company / month', 'Cost to company / year'],
        ...emps.filter(e => e.status === 'active').map(e => {
          const s = sm.get(e.id); const st = s && sById.get(s.structure_id);
          let r = null;
          try { if (st) r = calculatePayroll({ company, employee: e, salary: s, comps: mergeComponents(st.structure_components || [], comps), cal, ptSlabs: pt }); } catch { r = null; }
          return [e.emp_code, e.name, e.department || '', e.designation || '', st?.name || '', s?.annual_ctc || '', s?.monthly_gross || '', s?.effective_from || '',
            r ? r.employer_pf : '', r && r.employer_pf ? paidByLabel(company) : '', r ? r.employer_total : '', r ? r.ctc_cost : '', r ? r.ctc_cost * 12 : ''];
        })] };
    }
    const items = (await listItems(run.id)).sort((a, b) => (a.employee_json?.emp_code || '').localeCompare(b.employee_json?.emp_code || ''));
    let ytd = [];
    if (kind === 'ytd') {
      const fyStart = run.month >= 4 ? run.year : run.year - 1;
      const runs = (await listRuns(company.id)).filter(r => {
        const idx = r.year * 12 + r.month;
        return idx >= fyStart * 12 + 4 && idx <= run.year * 12 + run.month && r.status !== 'draft';
      });
      ytd = runs.length ? await q(sb.from('payroll_items').select('*').in('run_id', runs.map(r => r.id))) : [];
    }
    return { items, ytd };
  }, [kind, run.id]);
  const [busy, act] = useAction();

  return html`<${Async} state=${st}>${d => {
    const rows = REPORTS[kind].build({ ...d, run, company });
    const name = `${REPORTS[kind].label.replace(/[^A-Za-z]+/g, '-')}-${ym(run.year, run.month)}`;
    const xlsx = () => act(async () => {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Report');
      XLSX.writeFile(wb, name + '.xlsx');
    });
    const missingBank = kind === 'bank' && rows.slice(1).filter(r => r[1] === 'MISSING' || r[2] === 'MISSING').length;
    return html`<div class="stack">
      ${['ctc', 'employer', 'pf', 'register'].includes(kind) && html`<${ErPfPolicy} company=${company}
        prefix=${kind === 'ctc' ? "Calculated with today's setting: " : 'Figures are as calculated when the payroll was run. Current setting: '} />`}
      <div class="row">${kind !== 'ctc' && run.status !== 'locked' && html`<span class="notice">Run is ${run.status}; figures may change until it's locked.</span>`}
        ${missingBank > 0 && html`<span class="notice bad">${missingBank} employee(s) have no bank details.</span>`}
        <span class="spacer" /><button onClick=${() => downloadCSV(rows, name + '.csv')}>Export CSV</button><button class="primary" disabled=${busy} onClick=${xlsx}>Export Excel</button></div>
      <div class="card flush"><div class="table-wrap" style="max-height:65vh"><table>
        <thead><tr>${rows[0].map(h => html`<th>${h}</th>`)}</tr></thead>
        <tbody>${rows.length < 2 ? html`<tr><td colspan=${rows[0].length} class="empty">Nothing to report.</td></tr>` :
          rows.slice(1).map(r => html`<tr>${r.map(c => typeof c === 'number' ? html`<td class="num">${fmt(c)}</td>` : html`<td>${c}</td>`)}</tr>`)}</tbody>
      </table></div></div>
    </div>`;
  }}<//>`;
}
