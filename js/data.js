import { sb, q } from './lib.js';
import { monthCalendar, mergeComponents, salaryForMonth, calculatePayroll } from './engine.js';
import { monthStart, monthEnd } from './util.js';

export const listEmployees = cid =>
  q(sb.from('employees').select('*').eq('company_id', cid).order('emp_code'));
export const listSalaries = cid =>
  q(sb.from('employee_salaries').select('*').eq('company_id', cid).order('effective_from', { ascending: false }));
export const listStructures = cid =>
  q(sb.from('salary_structures').select('*, structure_components(*)').eq('company_id', cid).order('name'));
export const listComponents = cid =>
  q(sb.from('salary_components').select('*').eq('company_id', cid).order('sort_order'));
export const listLeaveTypes = cid =>
  q(sb.from('leave_types').select('*').eq('company_id', cid).order('name'));
export const listHolidays = cid =>
  q(sb.from('holidays').select('*').eq('company_id', cid).order('date'));
export const listPtSlabs = cid =>
  q(sb.from('pt_slabs').select('*').eq('company_id', cid).order('min_gross'));
export const listLeaves = (cid, from, to, employeeId) => {
  let qry = sb.from('leave_entries').select('*').eq('company_id', cid).gte('date', from).lte('date', to);
  if (employeeId) qry = qry.eq('employee_id', employeeId);
  return q(qry.order('date'));
};
export const getRun = (cid, year, month) =>
  q(sb.from('payroll_runs').select('*').eq('company_id', cid).eq('year', year).eq('month', month).maybeSingle());
export const listRuns = cid =>
  q(sb.from('payroll_runs').select('*').eq('company_id', cid).order('year', { ascending: false }).order('month', { ascending: false }));
export const listItems = runId =>
  q(sb.from('payroll_items').select('*').eq('run_id', runId));

/** Latest salary per employee effective by the given date. */
export function salaryMap(salaries, asOf) {
  const byEmp = new Map();
  for (const s of salaries) {
    if (!byEmp.has(s.employee_id)) byEmp.set(s.employee_id, []);
    byEmp.get(s.employee_id).push(s);
  }
  const out = new Map();
  for (const [emp, list] of byEmp) {
    const s = salaryForMonth(list, asOf);
    if (s) out.set(emp, s);
  }
  return out;
}

/** Everything needed to compute a month for a company. */
export async function loadPayrollContext(company, year, month) {
  const cid = company.id;
  const from = monthStart(year, month), to = monthEnd(year, month);
  const [employees, salaries, structures, components, leaveTypes, holidays, ptSlabs, leaves] = await Promise.all([
    listEmployees(cid), listSalaries(cid), listStructures(cid), listComponents(cid),
    listLeaveTypes(cid), listHolidays(cid), listPtSlabs(cid), listLeaves(cid, from, to),
  ]);
  const cal = monthCalendar(year, month, company.weekly_offs || [0, 6], holidays);
  const sal = salaryMap(salaries, to);
  const structById = new Map(structures.map(s => [s.id, s]));
  const leavesByEmp = new Map();
  for (const l of leaves) {
    if (!leavesByEmp.has(l.employee_id)) leavesByEmp.set(l.employee_id, []);
    leavesByEmp.get(l.employee_id).push(l);
  }
  // In payroll: active employees, plus anyone who exited during this month.
  const inScope = employees.filter(e =>
    (e.status === 'active' || (e.exit_date && e.exit_date >= from)) &&
    (!e.doj || e.doj <= to) && (!e.exit_date || e.exit_date >= from));

  const compute = (emp, adjustments) => {
    const salary = sal.get(emp.id);
    if (!salary) return { error: 'No salary assigned' };
    const st = structById.get(salary.structure_id);
    if (!st) return { error: 'Salary structure not found' };
    const comps = mergeComponents(st.structure_components || [], components);
    try {
      return {
        salary, structure: st,
        result: calculatePayroll({
          company, employee: emp, salary, comps, cal,
          entries: leavesByEmp.get(emp.id) || [], leaveTypes, ptSlabs,
          adjustments: adjustments || { additions: [], deductions: [], tds: 0 },
        }),
      };
    } catch (e) { return { error: e.message }; }
  };
  return { employees, inScope, salaries, sal, structures, structById, components, leaveTypes, holidays, ptSlabs, leaves, leavesByEmp, cal, compute };
}

export const employeeSnapshot = (e, structure) => ({
  emp_code: e.emp_code, name: e.name, email: e.email, designation: e.designation, department: e.department,
  doj: e.doj, dob: e.dob, pan: e.pan, uan: e.uan, esi_no: e.esi_no, bank_name: e.bank_name,
  bank_acct: e.bank_acct, ifsc: e.ifsc, structure: structure?.name || null,
});

export function itemRow(company, runId, emp, structure, r, adjustments) {
  return {
    company_id: company.id, run_id: runId, employee_id: emp.id,
    employee_json: employeeSnapshot(emp, structure),
    days_in_month: r.days_in_month, paid_days: r.paid_days, lop_days: r.lop_days,
    earnings_json: r.earnings, deductions_json: r.deductions,
    adjustments_json: adjustments || { additions: [], deductions: [], tds: 0 },
    gross: r.gross, earned_gross: r.earned_gross, lop_amount: r.lop_amount,
    total_deductions: r.total_deductions, net: r.net,
    employer_json: r.employer || [], employer_total: r.employer_total || 0,
  };
}

/** Sum of an item's employer lines with the given codes. */
export const employerAmt = (item, ...codes) =>
  (item.employer_json || []).filter(l => codes.includes(l.code)).reduce((s, l) => s + Number(l.amount), 0);
/** Same, but only the part the company bears (excludes the share recovered from the employee). */
export const employerCost = (item, ...codes) =>
  (item.employer_json || []).filter(l => codes.includes(l.code) && l.borne_by !== 'employee').reduce((s, l) => s + Number(l.amount), 0);
/** Employer EPF + EPS deducted from the employee's pay (when "paid by employee"). */
export const recoveredPf = item =>
  (item.deductions_json || []).filter(d => d.statutory_key === 'er_pf').reduce((s, d) => s + Number(d.amount), 0);

export function runTotals(items) {
  const sumDed = key => items.reduce((s, i) => s + (i.deductions_json || []).filter(d => d.statutory_key === key).reduce((a, d) => a + Number(d.amount), 0), 0);
  const sumEr = (...codes) => items.reduce((s, i) => s + employerAmt(i, ...codes), 0);
  const employerTotal = items.reduce((s, i) => s + Number(i.employer_total || 0), 0);
  const earned = items.reduce((s, i) => s + Number(i.earned_gross), 0);
  return {
    // remitted to EPFO (whoever bears it)
    employer_pf: sumEr('ER_EPF', 'ER_EPS'), employer_epf: sumEr('ER_EPF'), employer_eps: sumEr('ER_EPS'),
    // split by who bears it — never both
    employer_pf_company: items.reduce((s, i) => s + employerCost(i, 'ER_EPF', 'ER_EPS'), 0),
    employer_pf_recovered: items.reduce((s, i) => s + recoveredPf(i), 0),
    employer_edli: sumEr('ER_EDLI'), employer_admin: sumEr('ER_ADMIN'), employer_total: employerTotal,
    payroll_cost: earned + employerTotal,
    employees: items.length,
    gross: items.reduce((s, i) => s + Number(i.gross), 0),
    earned_gross: items.reduce((s, i) => s + Number(i.earned_gross), 0),
    lop_days: items.reduce((s, i) => s + Number(i.lop_days), 0),
    deductions: items.reduce((s, i) => s + Number(i.total_deductions), 0),
    net: items.reduce((s, i) => s + Number(i.net), 0),
    pf: sumDed('pf'), esi: sumDed('esi'), pt: sumDed('pt'), tds: sumDed('tds'),
  };
}
