import { html, useState, sb, q } from '../lib.js';
import { useAction, Field } from '../ui.js';
import { navigate } from '../util.js';
import { PayRulesForm, ComponentsEditor, LeaveTypesEditor, HolidaysEditor, PtSlabsEditor, ProfileForm, StatutoryForm,
  PAY_RULE_KEYS, PROFILE_KEYS, STATUTORY_KEYS, pick, payRuleErrors } from './editors.js';

const TABS = [['profile', 'Company profile'], ['statutory', 'Statutory IDs'], ['rules', 'Pay rules'], ['components', 'Salary components'],
  ['leave-types', 'Leave types'], ['holidays', 'Holidays'], ['pt', 'PT slabs'], ['payslip', 'Payslip']];

export function Settings({ ctx, tab }) {
  return html`<div class="stack">
    <h1>Settings</h1>
    <div class="tabs">${TABS.map(([k, l]) => html`<a href=${'#/settings/' + k} class=${tab === k ? 'active' : ''}>${l}</a>`)}</div>
    ${tab === 'profile' && html`<${CompanyForm} ctx=${ctx} keys=${PROFILE_KEYS} Form=${ProfileForm} />`}
    ${tab === 'statutory' && html`<${CompanyForm} ctx=${ctx} keys=${STATUTORY_KEYS} Form=${StatutoryForm} />`}
    ${tab === 'rules' && html`<${CompanyForm} ctx=${ctx} keys=${PAY_RULE_KEYS} Form=${PayRulesForm} />`}
    ${tab === 'payslip' && html`<${CompanyForm} ctx=${ctx} keys=${['payslip_template']} Form=${PayslipForm} />`}
    ${tab === 'components' && html`<${ComponentsEditor} ctx=${ctx} />`}
    ${tab === 'leave-types' && html`<${LeaveTypesEditor} ctx=${ctx} />`}
    ${tab === 'holidays' && html`<${HolidaysEditor} ctx=${ctx} />`}
    ${tab === 'pt' && html`<${PtSlabsEditor} ctx=${ctx} />`}
    ${tab === 'users' && html`<div class="notice info">Users moved to <a href="#/users">User Management</a>.</div>`}
    ${ctx.can.admin && ctx.company.setup_step > 5 && html`<div><button class="link" onClick=${async () => { await q(sb.from('companies').update({ setup_step: 1 }).eq('id', ctx.company.id)); await ctx.reload(); navigate('/setup'); }}>Re-run setup wizard</button></div>`}
  </div>`;
}

function CompanyForm({ ctx, keys, Form }) {
  const [c, setC] = useState({ ...ctx.company });
  const [busy, act] = useAction();
  const errors = Form === PayRulesForm ? payRuleErrors(c) : {};
  const invalid = Object.keys(errors).length > 0;
  const save = () => act(async () => {
    if (invalid) throw new Error(Object.values(errors)[0]);
    await q(sb.from('companies').update(pick(c, keys)).eq('id', ctx.company.id));
    await ctx.reload();
  }, 'Settings saved');
  return html`<div class="card stack">
    <${Form} c=${c} set=${setC} ctx=${ctx} errors=${errors} />
    ${ctx.can.admin ? html`<div class="row"><span class="spacer" /><button class="primary" disabled=${busy || invalid} onClick=${save}>Save</button></div>`
      : html`<p class="small muted">Only admins can change company settings.</p>`}
  </div>`;
}

function PayslipForm({ c, set }) {
  const t = c.payslip_template || {};
  const upd = patch => set({ ...c, payslip_template: { ...t, ...patch } });
  return html`<div class="grid g2">
    <${Field} label="PDF password" hint="Employees open their payslip with this password">
      <select value=${t.password || 'none'} onChange=${e => upd({ password: e.target.value })}>
        <option value="none">No password</option><option value="dob">Date of birth (DDMMYYYY)</option><option value="pan">PAN (capitals)</option>
      </select><//>
    <${Field} label="Footer text"><input value=${t.footer || ''} onInput=${e => upd({ footer: e.target.value })} /><//>
    <p class="small muted">The logo and address come from Company profile.</p>
  </div>`;
}
