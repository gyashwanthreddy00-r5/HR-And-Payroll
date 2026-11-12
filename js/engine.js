// =====================================================================
// Payroll engine — pure functions, no I/O. Unit tests: tests/engine.test.html
//
//   days_in_month = calendar days | fixed 30 | working days (excl. offs & holidays)
//   lop_days      = unpaid_leave_days + absent_days (half day = 0.5) + days not employed
//   paid_days     = days_in_month − lop_days
//   each earning  = full_amount × paid_days ÷ days_in_month
//   pf            = pf_rate% × min(earned_basic, pf_cap)          if PF enabled
//   esi           = esi_rate% × earned_gross                       if gross ≤ esi_limit
//   pt            = state slab on earned_gross
//   tds           = manual entry (v1)
//   net           = earned_gross − deductions + one-time additions
//
//   Employer PF (informational: never deducted from net, part of payroll cost)
//   er_wages      = min(earned_basic, er_pf_cap)          (cap 0 = no ceiling)
//   employer_pf   = er_pf_rate% × er_wages                (default 12%)
//   eps           = 8.33% × min(earned_basic, 15,000)      if EPS-eligible & under 58
//   epf           = employer_pf − eps                      (3.67% at standard wages)
//   edli / admin  = 0.5% × min(wages, 15,000) / 0.5% × er_wages   (type = EDLI)
// =====================================================================

const pad = n => String(n).padStart(2, '0');
const round = n => Math.round(n + Number.EPSILON);

/** Every day of a month with weekly-off / holiday flags. */
export function monthCalendar(year, month, weeklyOffs = [0, 6], holidays = []) {
  const hol = new Map(holidays.map(h => [String(h.date).slice(0, 10), h.name]));
  const n = new Date(year, month, 0).getDate();
  const days = [];
  for (let d = 1; d <= n; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    const dow = new Date(year, month - 1, d).getDay();
    const isOff = weeklyOffs.includes(dow);
    const holidayName = hol.get(date) || null;
    days.push({ date, day: d, dow, isOff, isHoliday: !!holidayName, holidayName, isWorking: !isOff && !holidayName });
  }
  return days;
}

export function daysInMonthFor(basis, cal) {
  if (basis === 'fixed30') return 30;
  if (basis === 'working') return cal.filter(d => d.isWorking).length;
  return cal.length;
}

/**
 * Count LOP for one employee in one month.
 * entries: [{date, kind:'leave'|'absent', leave_type_id, half_day, status}]
 * Leave on weekly offs / holidays is ignored. Days before joining or after exit are LOP.
 */
export function countLeaves({ cal, entries = [], leaveTypes = [], basis = 'calendar', doj = null, exitDate = null }) {
  const types = new Map(leaveTypes.map(t => [t.id, t]));
  const byDate = new Map(cal.map(d => [d.date, d]));
  let unpaid = 0, absent = 0, paidLeave = 0, notEmployed = 0;
  const byType = {};

  const inService = date => (!doj || date >= doj) && (!exitDate || date <= exitDate);
  // Days the employee was not on the rolls count as LOP.
  for (const d of cal) {
    if (inService(d.date)) continue;
    if (basis === 'working' && !d.isWorking) continue;
    notEmployed += 1;
  }
  for (const e of entries) {
    if (e.status && e.status !== 'approved') continue;
    const day = byDate.get(String(e.date).slice(0, 10));
    if (!day || !day.isWorking || !inService(day.date)) continue;
    const w = e.half_day ? 0.5 : 1;
    if (e.kind === 'absent') { absent += w; continue; }
    const t = types.get(e.leave_type_id);
    const code = t ? t.code : 'LEAVE';
    byType[code] = (byType[code] || 0) + w;
    if (t && t.paid) paidLeave += w; else unpaid += w;
  }
  return { unpaid, absent, paidLeave, notEmployed, byType, lop: unpaid + absent + notEmployed };
}

/** Evaluate a component formula safely. Variables: gross, basic, ctc (monthly), annual_ctc. */
export function evalFormula(expr, vars) {
  const src = String(expr || '').trim();
  if (!src) return 0;
  const allowedFns = ['min', 'max', 'round', 'floor', 'ceil', 'abs'];
  const idents = src.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const id of idents) {
    if (!(id in vars) && !allowedFns.includes(id)) throw new Error(`Unknown name "${id}" in formula`);
  }
  if (!/^[A-Za-z0-9_+\-*/%().,\s]*$/.test(src)) throw new Error('Formula contains invalid characters');
  const names = [...Object.keys(vars), ...allowedFns];
  const values = [...Object.values(vars), Math.min, Math.max, Math.round, Math.floor, Math.ceil, Math.abs];
  // eslint-disable-next-line no-new-func
  const v = Function(...names, `"use strict"; return (${src});`)(...values);
  if (typeof v !== 'number' || !isFinite(v)) throw new Error('Formula did not produce a number');
  return v;
}

/** Merge a structure_components row with its component (row overrides win). */
export function mergeComponents(structureRows, components) {
  const byId = new Map(components.map(c => [c.id, c]));
  return structureRows
    .map(r => {
      const c = byId.get(r.component_id);
      if (!c) return null;
      return {
        ...c,
        calc_type: r.calc_type || c.calc_type,
        value: r.value ?? c.value,
        formula: r.formula ?? c.formula,
        sort_order: r.sort_order ?? c.sort_order,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Full-month earnings from a structure and monthly gross. */
export function earningsBreakup(comps, monthlyGross, annualCtc = monthlyGross * 12) {
  const earnings = comps.filter(c => c.type === 'earning');
  const ctc = (annualCtc || 0) / 12;
  const out = new Map();
  let basic = 0;

  const amountOf = c => {
    switch (c.calc_type) {
      case 'fixed': return Number(c.value) || 0;
      case 'pct_gross': return monthlyGross * (Number(c.value) || 0) / 100;
      case 'pct_ctc': return ctc * (Number(c.value) || 0) / 100;
      case 'pct_basic': return basic * (Number(c.value) || 0) / 100;
      case 'formula': return evalFormula(c.formula, { gross: monthlyGross, basic, ctc, annual_ctc: annualCtc || 0 });
      default: return 0;
    }
  };
  // Basic first — other components may depend on it.
  const basicComp = earnings.find(c => c.statutory_key === 'basic') || earnings.find(c => c.code === 'BASIC');
  if (basicComp && basicComp.calc_type !== 'balance') { basic = round(amountOf(basicComp)); out.set(basicComp.id, basic); }
  for (const c of earnings) {
    if (out.has(c.id) || c.calc_type === 'balance') continue;
    out.set(c.id, round(amountOf(c)));
  }
  const used = [...out.values()].reduce((s, v) => s + v, 0);
  for (const c of earnings) {
    if (c.calc_type === 'balance') { out.set(c.id, Math.max(0, round(monthlyGross - used))); break; }
  }
  return earnings.filter(c => out.has(c.id)).map(c => ({
    id: c.id, code: c.code, name: c.name, taxable: c.taxable,
    is_basic: c === basicComp, full: out.get(c.id),
  }));
}

// Statutory constants (EPF & MP Act). The employer's rate and wage ceiling are company settings.
export const EPS_RATE = 8.33;
export const EPS_WAGE_CEILING = 15000;
export const EDLI_WAGE_CEILING = 15000;
export const EPS_MAX_AGE = 58;

/** EPS applies to eligible members until they turn 58. */
export function epsEligible(employee = {}, asOfIso) {
  if (employee.eps_eligible === false) return false;
  if (employee.dob && asOfIso) {
    const [y, m, d] = String(employee.dob).slice(0, 10).split('-').map(Number);
    const [ay, am, ad] = asOfIso.split('-').map(Number);
    const age = ay - y - ((am < m || (am === m && ad < d)) ? 1 : 0);
    if (age >= EPS_MAX_AGE) return false;
  }
  return true;
}

/**
 * Employer PF contribution lines for one month.
 * @param pfWages  eligible PF wages (earned Basic for the month)
 * @param isMember employee is covered by PF (structure contains the PF component)
 */
export function employerPf({ company, pfWages, employee = {}, asOfIso, isMember = true }) {
  if (!company.er_pf_enabled || !isMember || !(pfWages > 0)) return { lines: [], total: 0, pf: 0 };
  const rate = Number(company.er_pf_rate ?? 12);
  const cap = Number(company.er_pf_cap ?? 15000);
  const type = company.er_pf_type || 'EDLI';
  const wages = cap > 0 ? Math.min(pfWages, cap) : pfWages;
  const pf = round(wages * rate / 100);
  const epsWages = Math.min(pfWages, EPS_WAGE_CEILING);
  const eps = type !== 'EPF' && epsEligible(employee, asOfIso) ? Math.min(pf, round(epsWages * EPS_RATE / 100)) : 0;

  const lines = [{ code: 'ER_EPF', name: 'Employer EPF', amount: pf - eps, wages, head: 'pf' }];
  if (type !== 'EPF') lines.push({ code: 'ER_EPS', name: 'Employer EPS (pension)', amount: eps, wages: eps ? epsWages : 0, head: 'pf' });
  if (type === 'EDLI') {
    const edliWages = Math.min(pfWages, EDLI_WAGE_CEILING);
    lines.push({ code: 'ER_EDLI', name: 'EDLI contribution', amount: round(edliWages * Number(company.er_edli_rate ?? 0.5) / 100), wages: edliWages, head: 'edli' });
    lines.push({ code: 'ER_ADMIN', name: 'EPF admin charges', amount: round(wages * Number(company.er_admin_rate ?? 0.5) / 100), wages, head: 'admin' });
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0), pf };
}

export function ptForGross(slabs = [], gross) {
  const s = slabs.find(s => gross >= Number(s.min_gross) && (s.max_gross === null || s.max_gross === undefined || gross <= Number(s.max_gross)));
  return s ? Number(s.amount) : 0;
}

/**
 * Compute one employee's month.
 * @returns frozen payroll item (earnings/deductions arrays + totals)
 */
export function calculatePayroll({
  company, employee = {}, salary, comps, cal, entries = [], leaveTypes = [], ptSlabs = [],
  adjustments = { additions: [], deductions: [], tds: 0 },
}) {
  const basis = company.lop_basis || 'calendar';
  const dim = daysInMonthFor(basis, cal);
  const lv = countLeaves({ cal, entries, leaveTypes, basis, doj: employee.doj, exitDate: employee.exit_date });
  const lop = Math.min(lv.lop, dim);
  const paid = dim - lop;
  const ratio = dim ? paid / dim : 0;
  const gross = Number(salary.monthly_gross) || 0;

  const full = earningsBreakup(comps, gross, Number(salary.annual_ctc));
  const earnings = full.map(e => ({ code: e.code, name: e.name, full: e.full, amount: round(e.full * ratio), taxable: e.taxable, is_basic: e.is_basic }));
  const earnedGross = earnings.reduce((s, e) => s + e.amount, 0);
  const earnedBasic = (earnings.find(e => e.is_basic) || { amount: 0 }).amount;

  const deductions = [];
  for (const c of comps.filter(c => c.type === 'deduction')) {
    let amt = 0;
    switch (c.statutory_key) {
      case 'pf':
        if (!company.pf_enabled) continue;
        amt = round(Number(company.pf_rate) / 100 * Math.min(earnedBasic, Number(company.pf_cap)));
        break;
      case 'esi':
        if (!company.esi_enabled || gross > Number(company.esi_limit)) continue;
        amt = Math.ceil(Number(company.esi_rate) / 100 * earnedGross);
        break;
      case 'pt':
        if (!company.pt_enabled) continue;
        amt = ptForGross(ptSlabs, earnedGross);
        break;
      case 'tds':
        amt = round(Number(adjustments.tds) || 0);
        break;
      default:
        if (c.calc_type === 'fixed') amt = Number(c.value) || 0;
        else if (c.calc_type === 'pct_gross') amt = earnedGross * c.value / 100;
        else if (c.calc_type === 'pct_basic') amt = earnedBasic * c.value / 100;
        else if (c.calc_type === 'pct_ctc') amt = (Number(salary.annual_ctc) / 12) * c.value / 100;
        else if (c.calc_type === 'formula') amt = evalFormula(c.formula, { gross: earnedGross, basic: earnedBasic, ctc: Number(salary.annual_ctc) / 12, annual_ctc: Number(salary.annual_ctc) });
        amt = round(amt);
    }
    if (amt || c.statutory_key === 'tds') deductions.push({ code: c.code, name: c.name, amount: amt, statutory_key: c.statutory_key || null });
  }
  for (const d of adjustments.deductions || []) {
    if (Number(d.amount)) deductions.push({ code: 'ADJ', name: d.label || 'Deduction', amount: round(Number(d.amount)), one_time: true });
  }
  const additions = (adjustments.additions || []).filter(a => Number(a.amount))
    .map(a => ({ code: 'ADD', name: a.label || 'Addition', amount: round(Number(a.amount)), one_time: true }));

  // Employer PF is calculated exactly once. "Paid by" only decides who bears the EPF + EPS share:
  //   employer -> company expense (employer_total), not deducted
  //   employee -> one deduction line ER_PF_EE; the same lines stay in `employer` (for EPFO remittance)
  //               marked borne_by 'employee' and are excluded from company cost.
  // EDLI and admin charges always remain a company expense.
  const isPfMember = comps.some(c => c.type === 'deduction' && c.statutory_key === 'pf');
  const er = employerPf({ company, pfWages: earnedBasic, employee, asOfIso: cal.length ? cal[cal.length - 1].date : null, isMember: isPfMember });
  const paidBy = company.er_pf_paid_by === 'employee' ? 'employee' : 'employer';
  const employerLines = er.lines.map(l => ({ ...l, borne_by: paidBy === 'employee' && l.head === 'pf' ? 'employee' : 'employer' }));
  const recovered = employerLines.filter(l => l.borne_by === 'employee').reduce((s, l) => s + l.amount, 0);
  // One deduction line per employer head, kept apart from the employee's own PF line.
  for (const l of employerLines.filter(l => l.borne_by === 'employee' && l.amount > 0)) {
    deductions.push({
      code: l.code === 'ER_EPS' ? 'ER_EPS_EE' : 'ER_EPF_EE',
      name: l.code === 'ER_EPS' ? 'Employer EPS (borne by employee)' : 'Employer EPF (borne by employee)',
      amount: l.amount, statutory_key: 'er_pf',
    });
  }
  const employerCost = employerLines.filter(l => l.borne_by === 'employer').reduce((s, l) => s + l.amount, 0);

  const totalAdditions = additions.reduce((s, a) => s + a.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  return {
    employer: employerLines,
    employer_pf: er.pf,                 // EPF + EPS remitted, whoever bears it
    employer_pf_paid_by: paidBy,
    employer_pf_recovered: recovered,   // deducted from the employee's pay
    employer_total: employerCost,       // company expense only
    ctc_cost: earnedGross + totalAdditions + employerCost,
    days_in_month: dim,
    paid_days: paid,
    lop_days: lop,
    leave: lv,
    earnings: [...earnings, ...additions],
    deductions,
    gross,
    earned_gross: earnedGross + totalAdditions,
    lop_amount: round(gross - earnedGross),
    per_day: dim ? gross / dim : 0,
    total_deductions: totalDeductions,
    net: earnedGross + totalAdditions - totalDeductions,
  };
}

/** Human-readable rule for a component (salary tab "Rule" column). */
export function ruleLabel(c, company = {}, state = '') {
  const v = Number(c.value);
  switch (c.statutory_key) {
    case 'pf': return `${company.pf_rate ?? 12}% of Basic, cap ₹${Number(company.pf_cap ?? 15000).toLocaleString('en-IN')}`;
    case 'esi': return `${company.esi_rate ?? 0.75}% of gross if ≤ ₹${Number(company.esi_limit ?? 21000).toLocaleString('en-IN')}`;
    case 'pt': return `${state || company.state || 'State'} slab`;
    case 'tds': return 'Manual entry each month';
  }
  switch (c.calc_type) {
    case 'fixed': return `Fixed ₹${v.toLocaleString('en-IN')}`;
    case 'pct_gross': return `${v}% of gross`;
    case 'pct_basic': return `${v}% of Basic`;
    case 'pct_ctc': return `${v}% of CTC`;
    case 'balance': return 'Balance of gross';
    case 'formula': return `= ${c.formula}`;
    default: return c.calc_type;
  }
}

/** Salary record effective for a month (latest effective_from ≤ month end). */
export function salaryForMonth(salaries, monthEndIso) {
  return salaries
    .filter(s => s.effective_from <= monthEndIso)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : (a.created_at < b.created_at ? 1 : -1)))[0] || null;
}
