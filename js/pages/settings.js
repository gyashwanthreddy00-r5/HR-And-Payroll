import { html, useState, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Field, Badge } from '../ui.js';
import { navigate } from '../util.js';
import { PayRulesForm, ComponentsEditor, LeaveTypesEditor, HolidaysEditor, PtSlabsEditor, ProfileForm, StatutoryForm,
  PAY_RULE_KEYS, PROFILE_KEYS, STATUTORY_KEYS, pick, payRuleErrors } from './editors.js';

const TABS = [['profile', 'Company profile'], ['statutory', 'Statutory IDs'], ['rules', 'Pay rules'], ['components', 'Salary components'],
  ['leave-types', 'Leave types'], ['holidays', 'Holidays'], ['pt', 'PT slabs'], ['payslip', 'Payslip'], ['users', 'Users & roles']];

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
    ${tab === 'users' && html`<${Users} ctx=${ctx} />`}
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

function Users({ ctx }) {
  const cid = ctx.company.id;
  const st = useAsync(() => q(sb.from('company_users').select('*').eq('company_id', cid).order('created_at')), [cid]);
  const [f, setF] = useState({ email: '', role: 'hr' });
  const [busy, act] = useAction();
  const add = () => act(async () => { await q(sb.rpc('add_company_user', { p_company: cid, p_email: f.email.trim(), p_role: f.role })); setF({ email: '', role: 'hr' }); st.reload(); }, 'User added');
  const setRole = (u, role) => act(async () => { await q(sb.from('company_users').update({ role }).eq('company_id', cid).eq('user_id', u.user_id)); st.reload(); }, 'Role updated');
  const remove = u => confirm(`Remove ${u.email} from ${ctx.company.name}?`) && act(async () => { await q(sb.from('company_users').delete().eq('company_id', cid).eq('user_id', u.user_id)); st.reload(); }, 'Removed');
  const ROLES = [['admin', 'Admin: everything, incl. settings, users, unlock'], ['hr', 'HR: employees, salaries, leaves, payroll'], ['accountant', 'Accountant: view all, run & lock payroll, reports'], ['employee', 'Employee: own payslips only']];
  return html`<${Async} state=${st}>${users => html`<div class="stack">
    <div class="card flush"><table>
      <thead><tr><th>User</th><th>Role</th><th></th></tr></thead>
      <tbody>${users.map(u => html`<tr><td>${u.email || u.user_id}${u.user_id === ctx.user.id ? html` <${Badge}>you<//>` : ''}</td>
        <td>${ctx.can.admin && u.user_id !== ctx.user.id
          ? html`<select style="width:180px" value=${u.role} onChange=${e => setRole(u, e.target.value)}>${ROLES.map(([r]) => html`<option value=${r}>${r}</option>`)}</select>` : u.role}</td>
        <td class="num">${ctx.can.admin && u.user_id !== ctx.user.id && html`<button class="sm danger" onClick=${() => remove(u)}>Remove</button>`}</td></tr>`)}</tbody>
    </table></div>
    ${ctx.can.admin && html`<div class="card stack">
      <h3>Add a user</h3>
      <p class="small muted" style="margin:0">They must sign up first with this email. One login can belong to several companies, which is useful for accountants and CA firms.</p>
      <div class="row"><input type="email" style="width:260px" placeholder="email@company.com" value=${f.email} onInput=${e => setF({ ...f, email: e.target.value })} />
        <select style="width:200px" value=${f.role} onChange=${e => setF({ ...f, role: e.target.value })}>${ROLES.map(([r]) => html`<option value=${r}>${r}</option>`)}</select>
        <button class="primary" disabled=${busy || !f.email} onClick=${add}>Add user</button></div>
      <ul class="small muted" style="margin:0">${ROLES.map(([, d]) => html`<li>${d}</li>`)}</ul>
    </div>`}
    ${ctx.can.admin && ctx.company.setup_step > 5 && html`<div><button class="link" onClick=${async () => { await q(sb.from('companies').update({ setup_step: 1 }).eq('id', cid)); await ctx.reload(); navigate('/setup'); }}>Re-run setup wizard</button></div>`}
  </div>`}<//>`;
}
