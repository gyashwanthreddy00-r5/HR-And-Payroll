// Shared Employer PF display helpers, so every page describes the policy and the lines the same way.
import { html } from '../lib.js';
import { fmt } from '../util.js';

export const paidByLabel = c => (c.er_pf_paid_by === 'employee' ? 'Employee' : 'Company (Employer)');

/**
 * Deduction rows for display. Employer EPF is always listed under Deductions, kept separate from Employee PF:
 *  - paid by employee -> it's already a real deduction line (ER_EPF_EE) that reduces net pay
 *  - paid by company  -> added here as an informational row (info: true); NOT part of the amount deducted from pay
 */
export function deductionRows(deductions = [], employerLines = []) {
  const rows = deductions.map(d => ({ ...d, info: false }));
  const epf = employerLines.find(l => l.code === 'ER_EPF' && l.borne_by !== 'employee' && Number(l.amount) > 0);
  if (epf) {
    const at = rows.findIndex(d => d.statutory_key === 'pf');
    rows.splice(at >= 0 ? at + 1 : rows.length, 0,
      { code: 'ER_EPF_INFO', name: 'Employer EPF (paid by company)', amount: Number(epf.amount), info: true });
  }
  return rows;
}
/** Employer Contributions section: company-borne lines except Employer EPF, which is listed under Deductions. */
export const contributionLines = (employerLines = []) => employerLines.filter(l => l.borne_by !== 'employee' && l.code !== 'ER_EPF');
export const INFO_NOTE = '† Employer EPF is shown under deductions for information. It is paid by the company and not deducted from net pay.';

/** One-line summary of the company's Employer PF policy. */
export function erPfSummary(c) {
  if (!c.er_pf_enabled) return 'Employer PF is off';
  const cap = Number(c.er_pf_cap) > 0 ? `on wages up to ₹${fmt(c.er_pf_cap)}` : 'on actual wages';
  const type = { EPF: 'EPF only', EPS: 'EPF + EPS', EDLI: 'EPF + EPS + EDLI & admin' }[c.er_pf_type] || c.er_pf_type;
  return `Employer PF ${c.er_pf_rate}% ${cap} · ${type} · paid by ${paidByLabel(c)}`;
}

/** Preview deduction rows (salary tab / structure preview), Employer EPF included and marked. */
export function DeductionRows({ r, rule = () => '', cols = 2, annual = false, skipTds = false }) {
  const rows = deductionRows(r.deductions.filter(d => !(skipTds && d.statutory_key === 'tds')), r.employer || []);
  return rows.map(d => d.info
    ? html`<tr class="muted"><td>${d.name} †</td>${cols > 2 ? html`<td class="small">not deducted from pay</td>` : null}<td class="num">(${fmt(d.amount)})</td>${annual && html`<td class="num">(${fmt(d.amount * 12)})</td>`}</tr>`
    : html`<tr><td>${d.name}</td>${cols > 2 ? html`<td>${rule(d)}</td>` : null}<td class="num">−${fmt(d.amount)}</td>${annual && html`<td class="num">−${fmt(d.amount * 12)}</td>`}</tr>`);
}

/** Small notice linking to the setting. */
export const ErPfPolicy = ({ company, prefix = '' }) => html`<div class="notice info small">${prefix}${erPfSummary(company)}.
  <a href="#/settings/rules">Change in Settings → Pay rules</a></div>`;

/**
 * Rows for a calculation result's employer lines (preview tables).
 * Employee-borne lines are marked, so they're never read as company cost.
 */
export function EmployerRows({ r, cols = 2, annual = false }) {
  if (!r?.employer?.length) return null;
  const pad = cols > 2 ? html`<td></td>` : null;
  const lines = r.employer.filter(l => l.code !== 'ER_EPF'); // Employer EPF is shown under deductions
  return html`
    <tr><td colspan=${cols + (annual ? 1 : 0)} class="small muted" style="background:#fbfaf8">Employer contributions (Employer EPF is listed under deductions)${r.employer_pf_recovered > 0 ? '. EPF + EPS borne by the employee' : '. Paid by the company, not deducted'}</td></tr>
    ${lines.map(l => l.borne_by === 'employee'
      ? html`<tr class="muted"><td>${l.name} <span class="small">(borne by employee)</span></td>${pad}<td class="num">(${fmt(l.amount)})</td>${annual && html`<td class="num">(${fmt(l.amount * 12)})</td>`}</tr>`
      : html`<tr><td>${l.name}</td>${pad}<td class="num">${fmt(l.amount)}</td>${annual && html`<td class="num">${fmt(l.amount * 12)}</td>`}</tr>`)}
    <tr class="total"><td>Cost to company <span class="small muted" style="font-weight:400">(incl. Employer EPF)</span></td>${pad}<td class="num">${fmt(r.ctc_cost)}</td>${annual && html`<td class="num">${fmt(r.ctc_cost * 12)}</td>`}</tr>`;
}

/** True when an un-locked run was calculated with a different Employer PF policy than today's. */
export function policyChanged(company, items) {
  if (!items.length) return false;
  const expectEmployee = company.er_pf_enabled && company.er_pf_paid_by === 'employee';
  const anyLines = items.some(i => (i.employer_json || []).length);
  const anyEmployee = items.some(i => (i.employer_json || []).some(l => l.borne_by === 'employee'));
  const anyCompanyPf = items.some(i => (i.employer_json || []).some(l => l.head === 'pf' && l.borne_by !== 'employee'));
  if (!company.er_pf_enabled) return anyLines;
  if (!anyLines) return items.some(i => (i.deductions_json || []).some(d => d.statutory_key === 'pf'));
  return expectEmployee ? anyCompanyPf : anyEmployee;
}
