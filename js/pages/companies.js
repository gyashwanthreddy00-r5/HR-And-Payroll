import { html, useState, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Field, INDIAN_STATES } from '../ui.js';
import { loginEmail, loginName } from '../util.js';

/** Super admin: create companies and their HR logins. */
export function Companies({ ctx, memberships, onOpen, onCreated }) {
  const ids = memberships.map(m => m.company.id);
  const hrs = useAsync(() => ids.length
    ? q(sb.from('company_users').select('company_id, email, role').in('company_id', ids).in('role', ['hr', 'accountant']))
    : [], [ids.join(',')]);
  const blank = { name: '', state: 'Telangana', email: '', password: '' };
  const [f, setF] = useState(blank);
  const [busy, act] = useAction();
  const [hrFor, setHrFor] = useState(null);   // company id whose "Add HR login" row is open
  const [hr, setHr] = useState({ email: '', password: '' });

  const create = e => { e.preventDefault(); act(async () => {
    if (f.email.trim() && f.password.length < 6) throw new Error('HR password must be at least 6 characters');
    const id = await q(sb.rpc('admin_create_company', { p_name: f.name.trim(), p_state: f.state,
      p_hr_email: loginEmail(f.email) || null, p_hr_password: f.password || null }));
    setF(blank); await onCreated(id); hrs.reload();
  }, 'Company created'); };

  const addHr = cid => act(async () => {
    if (hr.password.length < 6) throw new Error('Password must be at least 6 characters');
    await q(sb.rpc('admin_create_company_user', { p_company: cid, p_email: loginEmail(hr.email), p_password: hr.password, p_role: 'hr' }));
    setHr({ email: '', password: '' }); setHrFor(null); hrs.reload();
  }, 'HR login created');

  return html`<div class="stack">
    <form class="card stack" onSubmit=${create}>
      <h3 style="margin:0">Create a company</h3>
      <div class="grid g2">
        <${Field} label="Company name"><input required value=${f.name} placeholder="Acme Infotech Pvt Ltd" onInput=${e => setF({ ...f, name: e.target.value })} /><//>
        <${Field} label="State (for Professional Tax)">
          <select value=${f.state} onChange=${e => setF({ ...f, state: e.target.value })}>${INDIAN_STATES.map(s => html`<option value=${s}>${s}</option>`)}</select><//>
        <${Field} label="HR username or email" hint="Optional. HR signs in with this and sees only this company.">
          <input type="text" autocomplete="off" placeholder="hr@company.com" value=${f.email} onInput=${e => setF({ ...f, email: e.target.value })} /><//>
        <${Field} label="HR password" hint="At least 6 characters. Share it with the HR person.">
          <input type="password" autocomplete="new-password" disabled=${!f.email.trim()} value=${f.password} onInput=${e => setF({ ...f, password: e.target.value })} /><//>
      </div>
      <div class="row"><span class="spacer" /><button class="primary" disabled=${busy || !f.name.trim()}>Create company</button></div>
    </form>

    <${Async} state=${hrs}>${rows => html`<div class="card flush"><div class="table-wrap"><table>
      <thead><tr><th>Company</th><th>State</th><th>HR / accountant logins</th><th></th></tr></thead>
      <tbody>${!memberships.length && html`<tr><td colspan="4" class="muted" style="text-align:center;padding:24px">No companies yet. Create one above.</td></tr>`}
      ${memberships.map(m => {
        const c = m.company;
        const logins = rows.filter(r => r.company_id === c.id);
        return html`<tr>
          <td><b>${c.name}</b>${c.id === ctx.company.id ? html` <span class="badge ok">open</span>` : ''}</td>
          <td>${c.state}</td>
          <td>${logins.length ? logins.map(r => html`<div>${loginName(r.email)} <span class="badge">${r.role}</span></div>`) : html`<span class="muted">None yet</span>`}
            ${hrFor === c.id && html`<div class="row" style="margin-top:8px">
              <input type="text" style="width:200px" placeholder="hr1 or hr@company.com" autocomplete="off" value=${hr.email} onInput=${e => setHr({ ...hr, email: e.target.value })} />
              <input type="password" style="width:160px" placeholder="Password (min 6)" autocomplete="new-password" value=${hr.password} onInput=${e => setHr({ ...hr, password: e.target.value })} />
              <button class="sm primary" disabled=${busy || !hr.email.trim()} onClick=${() => addHr(c.id)}>Create</button>
              <button class="sm" onClick=${() => setHrFor(null)}>Cancel</button></div>`}</td>
          <td class="num"><div class="row" style="justify-content:flex-end;gap:6px">
            ${m.role === 'admin' && hrFor !== c.id && html`<button class="sm" onClick=${() => { setHrFor(c.id); setHr({ email: '', password: '' }); }}>+ HR login</button>`}
            ${c.id !== ctx.company.id && html`<button class="sm" onClick=${() => onOpen(c.id)}>Open</button>`}</div></td>
        </tr>`;
      })}</tbody>
    </table></div></div>`}<//>
  </div>`;
}
