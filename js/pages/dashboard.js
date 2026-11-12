import { html, sb, q } from '../lib.js';
import { useAsync, Async, Badge } from '../ui.js';
import { loadPayrollContext, getRun } from '../data.js';
import { erPfSummary, paidByLabel } from './employer.js';
import { fmt, money, monthLabel, prevMonth, ym, monthStart, monthEnd, navigate } from '../util.js';

/** Screen 2 — current month's status: what is pending before payroll can be run. */
export function Dashboard({ ctx }) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth() + 1;
  const prev = prevMonth(year, month);
  const st = useAsync(async () => {
    const pc = await loadPayrollContext(ctx.company, year, month);
    const [run, prevRun] = await Promise.all([getRun(ctx.company.id, year, month), getRun(ctx.company.id, prev.year, prev.month)]);
    let prevSlips = 0, prevItems = 0;
    if (prevRun) {
      const items = await q(sb.from('payroll_items').select('id, payslips(generated_at, emailed_at)').eq('run_id', prevRun.id));
      prevItems = items.length;
      prevSlips = items.filter(i => (Array.isArray(i.payslips) ? i.payslips.length : i.payslips)).length;
    }
    return { pc, run, prevRun, prevSlips, prevItems };
  }, [ctx.company.id]);

  return html`<${Async} state=${st}>${({ pc, run, prevRun, prevSlips, prevItems }) => {
    const active = pc.inScope;
    let lopTotal = 0;
    const noSalary = [], noBank = [], errors = [];
    for (const e of active) {
      if (!e.bank_acct || !e.ifsc) noBank.push(e);
      const r = pc.compute(e);
      if (r.error === 'No salary assigned') noSalary.push(e);
      else if (r.error) errors.push([e, r.error]);
      else lopTotal += r.result.lop_days;
    }
    const withLeaves = new Set(pc.leaves.map(l => l.employee_id)).size;
    const revisions = pc.salaries.filter(s => s.effective_from >= monthStart(year, month) && s.effective_from <= monthEnd(year, month));
    const statusLabel = !run ? 'Payroll not run yet' : run.status === 'locked' ? 'Payroll locked' : 'Payroll processed, not locked';

    const checks = [
      [`Leave entries this month (${withLeaves} of ${active.length} employees have entries)`, pc.leaves.length ? html`<${Badge} kind="ok">Recorded<//>` : html`<${Badge}>None yet<//>`, '/leaves'],
      [`${noSalary.length} employee${noSalary.length === 1 ? '' : 's'} without a salary`, noSalary.length ? html`<${Badge} kind="bad">Missing<//>` : html`<${Badge} kind="ok">Done<//>`, '/employees'],
      [`${noBank.length} employee${noBank.length === 1 ? '' : 's'} need bank details`, noBank.length ? html`<${Badge} kind="warn">Missing<//>` : html`<${Badge} kind="ok">Done<//>`, '/employees'],
      [`${revisions.length} salary revision${revisions.length === 1 ? '' : 's'} effective this month`, html`<${Badge} kind="ok">${revisions.length ? 'Applied' : 'None'}<//>`, null],
      [erPfSummary(ctx.company), html`<${Badge} kind=${ctx.company.er_pf_enabled && ctx.company.er_pf_paid_by === 'employee' ? 'warn' : 'ok'}>${ctx.company.er_pf_enabled ? `Paid by ${paidByLabel(ctx.company)}` : 'Off'}<//>`, ctx.can.admin ? '/settings/rules' : null],
      ['TDS amounts for the month', run ? html`<${Badge} kind="ok">Enter in register<//>` : html`<${Badge}>After run<//>`, ctx.can.payroll ? `/payroll/${ym(year, month)}` : null],
    ];
    if (errors.length) checks.push([`${errors.length} calculation error(s): ${errors.map(([e, m]) => `${e.emp_code} ${m}`).join('; ')}`, html`<${Badge} kind="bad">Fix<//>`, '/structures']);

    return html`<div class="stack">
      <div class="row between"><h1 style="margin:0">${monthLabel(year, month)}</h1><span class="small muted"><b>${statusLabel}</b></span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="card stat"><div class="label">Active employees</div><div class="value">${active.length}</div></div>
        <div class="card stat"><div class="label">Last month net payout</div><div class="value">${prevRun ? money(prevRun.totals?.net) : '–'}</div></div>
        <div class="card stat" title="Earned gross + employer contributions borne by the company"><div class="label">Last month payroll cost</div><div class="value">${prevRun ? money(prevRun.totals?.payroll_cost ?? (Number(prevRun.totals?.earned_gross || 0) + Number(prevRun.totals?.employer_total || 0))) : '–'}</div></div>
        <div class="card stat"><div class="label">LOP days this month</div><div class="value">${fmt(lopTotal)}</div></div>
        <div class="card stat"><div class="label">Payslips (${monthLabel(prev.year, prev.month).slice(0, 3)})</div><div class="value">${prevRun ? `${prevSlips} / ${prevItems}` : '–'}</div></div>
      </div>
      <div class="card flush"><table>
        <thead><tr><th>Before you run ${monthLabel(year, month).split(' ')[0]} payroll</th><th>Status</th></tr></thead>
        <tbody>${checks.map(([t, s, href]) => html`<tr class=${href ? 'click' : ''} onClick=${() => href && navigate(href)}><td>${t}</td><td>${s}</td></tr>`)}</tbody>
      </table></div>
      ${ctx.can.payroll && html`<div><button class="primary" onClick=${() => navigate(`/payroll/${ym(year, month)}`)}>${run ? 'Open' : 'Run'} ${monthLabel(year, month).split(' ')[0]} payroll</button></div>`}
      ${!active.length && html`<div class="notice info">No employees yet. <a href="#/employees">Add employees</a> or import them from Excel to get started.</div>`}
    </div>`;
  }}<//>`;
}
