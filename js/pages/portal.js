import { html, useState, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Modal } from '../ui.js';
import { fmt, monthLabel, downloadBlob } from '../util.js';
import { generatePayslipPdf } from '../payslip.js';
import { PayslipView } from './payslips.js';

/** Employee self-service: own payslips from locked runs (enforced by RLS). */
export function Portal({ ctx }) {
  const st = useAsync(async () => {
    const me = await q(sb.from('employees').select('*').eq('company_id', ctx.company.id).eq('user_id', ctx.user.id).maybeSingle());
    const items = me ? await q(sb.from('payroll_items').select('*, run:payroll_runs(year, month, status)').eq('employee_id', me.id)) : [];
    return { me, items: items.filter(i => i.run).sort((a, b) => (b.run.year * 12 + b.run.month) - (a.run.year * 12 + a.run.month)) };
  }, [ctx.company.id]);
  const [busy, act] = useAction();
  const [viewing, setViewing] = useState(null);
  return html`<${Async} state=${st}>${({ me, items }) => !me
    ? html`<div class="empty">Your login isn't linked to an employee record in ${ctx.company.name} yet. Ask HR to grant portal access.</div>`
    : html`<div class="stack">
      <h1>Hi ${me.name.split(' ')[0]}</h1>
      <div class="muted">${me.emp_code} · ${me.designation || ''} · ${me.department || ''}</div>
      <div class="card flush"><table>
        <thead><tr><th>Month</th><th class="num">Paid days</th><th class="num">Net pay</th><th></th></tr></thead>
        <tbody>${items.length ? items.map(i => html`<tr><td>${monthLabel(i.run.year, i.run.month)}</td><td class="num">${i.paid_days}</td><td class="num">${fmt(i.net)}</td>
          <td class="num"><button class="sm" onClick=${() => setViewing(i)}>View</button> <button class="sm" disabled=${busy} onClick=${() => act(async () => {
            const p = await generatePayslipPdf(ctx.company, i, i.run); downloadBlob(p.blob, p.filename);
          })}>Download PDF</button></td></tr>`) : html`<tr><td colspan="4" class="empty">No payslips published yet.</td></tr>`}</tbody>
      </table></div>
      ${viewing && html`<${Modal} title="Payslip" wide onClose=${() => setViewing(null)}><${PayslipView} company=${ctx.company} item=${viewing} run=${viewing.run} /><//>`}
    </div>`}<//>`;
}
