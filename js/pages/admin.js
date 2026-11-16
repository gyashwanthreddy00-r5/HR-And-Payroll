import { html, useState, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Field, Badge, Modal } from '../ui.js';
import { BASE, SYSTEM_KEYS, EDITABLE_PAGES } from '../access.js';
import { loginEmail, loginName } from '../util.js';

const AdminOnly = () => html`<div class="card empty">Only admins can open this page.</div>`;
const MigrationNote = ({ file = '006_pages_access.sql' }) => html`<div class="notice">Run <b>supabase/migrations/${file}</b> in Supabase → SQL Editor to save changes on this page.</div>`;
const Head = ({ title, sub, children }) => html`<div class="row between">
  <div><h2 style="margin:0">${title}</h2>${sub && html`<p class="muted" style="margin:2px 0 0">${sub}</p>`}</div>${children}</div>`;

const useMembers = cid => useAsync(() => q(sb.from('company_users').select('*').eq('company_id', cid).order('created_at')), [cid]);

/* Lucide line icons used on these pages. */
const I = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  check: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  x: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>',
};
const Ic = ({ n }) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: I[n] }}></svg>`;
const Pill = ({ on, children }) => html`<span class=${'um-status ' + (on ? 'on' : 'off')}>${children}</span>`;

const needs = file => e => {
  if (/schema cache|does not exist|Could not find/.test(e.message)) throw new Error(`Run supabase/migrations/${file} in Supabase → SQL Editor first.`);
  throw e;
};
const slug = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '').slice(0, 30);

/* ------------------------------------------------------------------ Roles & Permissions */
export function RolesPermissions({ ctx, access }) {
  const cid = ctx.company.id;
  const st = useMembers(cid);
  const [editing, setEditing] = useState(null);   // null | 'new' | role
  const [busy, act] = useAction();
  if (!ctx.can.admin) return html`<${AdminOnly} />`;
  const roles = access.roles;
  const AREAS = [['employees', 'Employees'], ['salaries', 'Salaries'], ['leaves', 'Leaves'], ['payroll', 'Payroll'], ['payslips', 'Payslips'], ['settings', 'Settings'], ['users', 'Users']];

  const toggle = r => act(async () => {
    await q(sb.from('company_roles').update({ active: !r.active }).eq('company_id', cid).eq('key', r.key)).catch(needs('009_custom_roles.sql'));
    await ctx.reloadAccess();
  }, `${r.name} is now ${r.active ? 'inactive' : 'active'}`);

  return html`<${Async} state=${st}>${users => {
    const count = k => users.filter(u => (u.role_key || u.role) === k).length;
    const remove = r => {
      if (count(r.key)) { act(async () => { throw new Error(`${r.name} is assigned to ${count(r.key)} user(s). Move them to another role first.`); }); return; }
      confirm(`Delete the ${r.name} role and its page access? This cannot be undone.`) && act(async () => {
        await q(sb.from('company_role_pages').delete().eq('company_id', cid).eq('role', r.key)).catch(needs('009_custom_roles.sql'));
        await q(sb.from('company_roles').delete().eq('company_id', cid).eq('key', r.key)).catch(needs('009_custom_roles.sql'));
        await ctx.reloadAccess();
      }, 'Role deleted');
    };
    return html`<div class="stack">
      <${Head} title="Roles & Permissions" sub=${roles.length + (roles.length === 1 ? ' role' : ' roles')}>
        <button class="primary" onClick=${() => setEditing('new')}><${Ic} n="plus" /> Add New</button><//>
      ${!access.rolesReady && html`<${MigrationNote} file="009_custom_roles.sql" />`}
      <div class="card flush"><div class="table-wrap"><table class="um-table">
        <thead><tr><th>Role name</th><th>Description</th><th>Data access</th><th class="num">Users</th><th>Status</th><th class="num">Actions</th></tr></thead>
        <tbody>${roles.map(r => html`<tr>
          <td><span class="rl-name"><span class="rl-ico"><${Ic} n="shield" /></span><b>${r.name}</b>${r.system && html`<span class="rl-lock" title="System role"><${Ic} n="lock" /></span>`}</span></td>
          <td class="muted">${r.key === 'admin' ? 'Full access to all pages' : r.description || '—'}</td>
          <td><span class="badge">${BASE[r.base].name}</span></td>
          <td class="num">${count(r.key)}</td>
          <td><${Pill} on=${r.active}>${r.active ? 'Active' : 'Inactive'}<//></td>
          <td class="num"><div class="um-actions">
            ${!r.system && html`<button class="sm" disabled=${busy} onClick=${() => toggle(r)}>${r.active ? 'Inactive' : 'Active'}</button>`}
            <button class="icon" title="Edit" onClick=${() => setEditing(r)}><${Ic} n="pencil" /></button>
            ${!r.system && html`<button class="icon del" title="Delete" disabled=${busy} onClick=${() => remove(r)}><${Ic} n="trash" /></button>`}
          </div></td></tr>`)}</tbody>
      </table></div></div>

      <div class="card flush"><div class="rp-head">What each data access level can do</div><div class="table-wrap"><table>
        <thead><tr><th>Data</th>${SYSTEM_KEYS.map(k => html`<th>${BASE[k].name}</th>`)}</tr></thead>
        <tbody>${AREAS.map(([k, l]) => html`<tr><td><b>${l}</b></td>${SYSTEM_KEYS.map(b => html`<td class=${BASE[b].data[k] === '—' ? 'muted' : ''}>${BASE[b].data[k]}</td>`)}</tr>`)}</tbody>
      </table></div></div>
      <p class="small muted" style="margin:0">The database enforces each role's data access level. Which menu pages a role sees, and whether they are view-only, is set in <a href="#/role-pages">Role-Page Assignment</a>.</p>

      ${editing && html`<${RoleForm} ctx=${ctx} role=${editing === 'new' ? null : editing} roles=${roles}
        onClose=${() => setEditing(null)} onSaved=${async () => { setEditing(null); await ctx.reloadAccess(); }} />`}
    </div>`;
  }}<//>`;
}

function RoleForm({ ctx, role, roles, onClose, onSaved }) {
  const cid = ctx.company.id;
  const [f, setF] = useState({ name: role?.name || '', key: role?.key || '', keyTouched: false, description: role?.description || '',
    base: role?.base || 'hr', active: role ? role.active : true, copyFrom: '' });
  const [busy, act] = useAction();
  const key = role ? role.key : (f.keyTouched ? slug(f.key) : slug(f.name));
  const save = e => { e.preventDefault(); act(async () => {
    const name = f.name.trim();
    if (name.length < 2) throw new Error('Role name must be at least 2 characters');
    if (roles.some(r => r.key !== role?.key && r.name.toLowerCase() === name.toLowerCase())) throw new Error(`A role named "${name}" already exists`);
    if (!role) {
      if (key.length < 2) throw new Error('Role key must be 2 to 30 letters, numbers or underscores, starting with a letter');
      if (roles.some(r => r.key === key)) throw new Error(`A role with key "${key}" already exists`);
    }
    const row = { company_id: cid, key, name, description: f.description.trim() || null,
      base_role: role ? role.base : f.base, is_system: !!role?.system, active: role?.system ? true : f.active };
    await q(sb.from('company_roles').upsert(row)).catch(needs('009_custom_roles.sql'));
    if (!role && f.copyFrom) {
      const src = await q(sb.from('company_role_pages').select('page_key, can_view, can_edit').eq('company_id', cid).eq('role', f.copyFrom));
      if (src.length) await q(sb.from('company_role_pages').upsert(src.map(x => ({ ...x, company_id: cid, role: key }))));
    }
    onSaved();
  }, 'Role saved'); };
  return html`<${Modal} title=${role ? 'Edit Role — ' + role.name : 'Add Role'} onClose=${onClose}>
    <form class="stack" onSubmit=${save}>
      <${Field} label="Role name"><input required maxlength="50" autofocus value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} placeholder="e.g. Payroll Clerk" /><//>
      <${Field} label="Role key" hint=${role ? "The key can't be changed once created." : 'Used internally; letters, numbers and underscores.'}>
        <input maxlength="30" disabled=${!!role} value=${key} onInput=${e => setF({ ...f, key: e.target.value, keyTouched: true })} /><//>
      <${Field} label="Description"><input maxlength="200" value=${f.description} onInput=${e => setF({ ...f, description: e.target.value })} /><//>
      ${role
        ? html`<${Field} label="Data access" hint="Set when the role was created."><input disabled value=${BASE[role.base].name + ' — ' + BASE[role.base].desc} /><//>`
        : html`<${Field} label="Data access" hint="What the database lets this role read and change.">
            <select value=${f.base} onChange=${e => setF({ ...f, base: e.target.value })}>
              ${['hr', 'accountant', 'employee'].map(b => html`<option value=${b}>Like ${BASE[b].name} — ${BASE[b].desc}</option>`)}</select><//>
          <${Field} label="Copy page access from" hint="Optional — start with the same pages as an existing role.">
            <select value=${f.copyFrom} onChange=${e => setF({ ...f, copyFrom: e.target.value })}>
              <option value="">— None —</option>
              ${roles.filter(r => r.key !== 'admin' && r.base !== 'employee').map(r => html`<option value=${r.key}>${r.name}</option>`)}</select><//>`}
      ${!role?.system && html`<label class="check"><input type="checkbox" checked=${f.active} onChange=${e => setF({ ...f, active: e.target.checked })} /> Active (can be given to users)</label>`}
      <div class="row"><span class="spacer" /><button type="button" onClick=${onClose}>Cancel</button><button class="primary" disabled=${busy}>Save</button></div>
    </form><//>`;
}

/* ------------------------------------------------------------------ User Management */
export function UserManagement({ ctx, access }) {
  const cid = ctx.company.id;
  const st = useMembers(cid);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);   // null | 'new' | member row
  const [busy, act] = useAction();
  if (!ctx.can.admin) return html`<${AdminOnly} />`;
  const keyOf = u => u.role_key || u.role;
  const roleName = u => (access.roleOf(keyOf(u)) || { name: u.role }).name;
  const isActive = u => u.active !== false;
  const display = u => u.full_name || loginName(u.email);

  const toggle = u => act(async () => {
    await q(sb.rpc('admin_update_company_user', { p_company: cid, p_user: u.user_id, p_full_name: u.full_name, p_role: u.role, p_active: !isActive(u), p_password: null })).catch(needs('008_user_management.sql'));
    st.reload();
  }, isActive(u) ? 'User deactivated' : 'User activated');

  const remove = u => confirm(`Delete ${display(u)}? They lose access to ${ctx.company.name}. If the login belongs to no other company, it is deleted too. This cannot be undone.`)
    && act(async () => { await q(sb.rpc('admin_delete_company_user', { p_company: cid, p_user: u.user_id })).catch(needs('008_user_management.sql')); st.reload(); }, 'User deleted');

  return html`<${Async} state=${st}>${users => {
    const total = users.length, active = users.filter(isActive).length;
    const t = search.trim().toLowerCase();
    const rows = !t ? users : users.filter(u => [display(u), loginName(u.email), roleName(u)].some(x => (x || '').toLowerCase().includes(t)));
    const stat = (icon, tone, n, label) => html`<div class="card um-stat"><span class=${'um-ico ' + tone}><${Ic} n=${icon} /></span><div><div class="um-n">${n}</div><div class="muted">${label}</div></div></div>`;
    return html`<div class="stack">
      <${Head} title="User Management" sub=${total + (total === 1 ? ' user' : ' users')}>
        <button class="primary" onClick=${() => setForm('new')}><${Ic} n="plus" /> Add New</button><//>
      <div class="grid g4">
        ${stat('users', 'blue', total, 'Total Users')}
        ${stat('check', 'green', active, 'Active')}
        ${stat('x', 'gray', total - active, 'Inactive')}
        ${stat('shield', 'amber', users.filter(u => u.role).length, 'With Roles')}
      </div>
      <div class="um-search"><${Ic} n="search" /><input placeholder="Search by username, display name, or role..." aria-label="Search users" value=${search} onInput=${e => setSearch(e.target.value)} /></div>
      <div class="card flush"><div class="table-wrap"><table class="um-table">
        <thead><tr><th>User</th><th>Roles</th><th>Status</th><th class="num">Actions</th></tr></thead>
        <tbody>${rows.length ? rows.map(u => { const me = u.user_id === ctx.user.id; return html`<tr>
          <td><div class="um-user"><span class="um-av">${(display(u) || '?')[0].toUpperCase()}</span>
            <div><div class="um-name">${display(u)}${me && html` <span class="muted small" style="font-weight:600">(you)</span>`}</div><div class="small muted">${loginName(u.email)}</div></div></div></td>
          <td><span class="um-role"><${Ic} n="shield" /> ${roleName(u)}</span></td>
          <td><${Pill} on=${isActive(u)}>${isActive(u) ? 'Active' : 'Inactive'}<//></td>
          <td class="num"><div class="um-actions">
            <button class="icon" title=${me ? "You can't deactivate yourself" : isActive(u) ? 'Deactivate' : 'Activate'} disabled=${me || busy} onClick=${() => toggle(u)}><${Ic} n="power" /></button>
            <button class="icon" title="Edit" disabled=${busy} onClick=${() => setForm(u)}><${Ic} n="pencil" /></button>
            <button class="icon del" title=${me ? "You can't delete yourself" : 'Delete'} disabled=${me || busy} onClick=${() => remove(u)}><${Ic} n="trash" /></button>
          </div></td></tr>`; }) : html`<tr><td colspan="4" class="empty">${users.length ? `No users match "${search}".` : 'No users yet.'}</td></tr>`}</tbody>
      </table></div></div>
      ${form && html`<${UserForm} ctx=${ctx} access=${access} row=${form === 'new' ? null : form}
        onClose=${() => setForm(null)} onSaved=${() => { setForm(null); st.reload(); }} />`}
    </div>`;
  }}<//>`;
}

function UserForm({ ctx, access, row, onClose, onSaved }) {
  const cid = ctx.company.id;
  const me = row?.user_id === ctx.user.id;
  const [f, setF] = useState({ email: row ? loginName(row.email) : '', full_name: row?.full_name || '', password: '',
    active: row ? row.active !== false : true, role: row ? (row.role_key || row.role) : 'hr' });
  const [showPw, setShowPw] = useState(false);
  const [busy, act] = useAction();
  const choices = access.roles.filter(r => r.active || r.key === f.role);
  const save = e => { e.preventDefault(); act(async () => {
    if (!f.role) throw new Error('Assign a role');
    if (f.password && f.password.length < 6) throw new Error('Password must be at least 6 characters');
    const base = (access.roleOf(f.role) || { base: f.role }).base;
    let uid = row?.user_id;
    if (!row) {
      if (!f.email.trim()) throw new Error('Enter a username or email');
      if (!f.password) throw new Error('Set a password');
      if (loginEmail(f.email) === (ctx.user.email || '').toLowerCase()) throw new Error("That is your own login. Enter the new user's username or email.");
      uid = await q(sb.rpc('admin_create_company_user', { p_company: cid, p_email: loginEmail(f.email), p_password: f.password, p_role: base }));
    }
    await q(sb.rpc('admin_update_company_user', { p_company: cid, p_user: uid, p_full_name: f.full_name,
      p_role: me ? row.role : base, p_active: me ? true : f.active, p_password: row ? (f.password || null) : null })).catch(needs('008_user_management.sql'));
    if (!me && f.role !== (row ? (row.role_key || row.role) : base)) {
      await q(sb.rpc('admin_set_user_role', { p_company: cid, p_user: uid, p_role_key: f.role })).catch(needs('009_custom_roles.sql'));
    }
    onSaved();
  }, row ? 'User saved' : 'User created'); };
  return html`<${Modal} wide title=${row ? 'Edit User Management' : 'Add New User Management'} onClose=${onClose}>
    <form class="stack" onSubmit=${save}>
      <div class="grid g2">
        <${Field} label="Username" hint=${row ? undefined : 'They sign in with this, e.g. hr1 (an email works too)'}>
          <input required disabled=${!!row} maxlength="60" autocomplete="off" placeholder="login username" value=${f.email} onInput=${e => setF({ ...f, email: e.target.value.replace(/\s/g, '') })} /><//>
        <${Field} label="Display Name"><input maxlength="100" placeholder="Full name" value=${f.full_name} onInput=${e => setF({ ...f, full_name: e.target.value })} /><//>
        <${Field} label="Password" hint=${row ? 'Leave blank to keep the current password.' : 'Password must be at least 6 characters.'}>
          <div class="ibox pw-box"><input type=${showPw ? 'text' : 'password'} maxlength="72" autocomplete="new-password" placeholder=${row ? 'Type a new password' : 'Set password'}
            value=${f.password} onInput=${e => setF({ ...f, password: e.target.value })} />
            <button type="button" class="eye" onClick=${() => setShowPw(s => !s)} title=${showPw ? 'Hide password' : 'Show password'} aria-label=${showPw ? 'Hide password' : 'Show password'}><${Ic} n=${showPw ? 'eyeOff' : 'eye'} /></button></div><//>
        <${Field} label="Status" hint=${me ? "You can't deactivate yourself." : undefined}>
          <select disabled=${me} value=${f.active ? 'true' : 'false'} onChange=${e => setF({ ...f, active: e.target.value === 'true' })}>
            <option value="true">Active</option><option value="false">Inactive</option></select><//>
      </div>
      <div>
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#334155">Assign Roles</p>
        <div class="stack" style="gap:8px">${choices.map(r => html`<label class=${'role-pick' + (f.role === r.key ? ' on' : '') + (me ? ' locked' : '')}>
          <input type="checkbox" disabled=${me} checked=${f.role === r.key} onChange=${e => setF({ ...f, role: e.target.checked ? r.key : '' })} />
          <div style="flex:1;min-width:0"><div style="font-weight:500">${r.name}</div><div class="small muted">${r.key === 'admin' ? 'Full access to all pages' : r.description || '—'}</div></div>
          <${Pill} on=${r.active}>${r.active ? 'Active' : 'Inactive'}<//></label>`)}</div>
        ${me && html`<p class="small muted" style="margin:6px 0 0">You can't change your own role.</p>`}
      </div>
      <div class="row"><span class="spacer" /><button type="button" onClick=${onClose}>Cancel</button><button class="primary" disabled=${busy}>Save</button></div>
    </form><//>`;
}

/* ------------------------------------------------------------------ Pages Management */
export function PagesManagement({ ctx, access }) {
  const cid = ctx.company.id;
  const [busy, act] = useAction();
  const [editing, setEditing] = useState(null);
  if (!ctx.can.admin) return html`<${AdminOnly} />`;
  const save = (p, patch) => act(async () => {
    const row = { company_id: cid, page_key: p.key, label: p.label, sort_order: p.sort, active: p.active, ...patch };
    if (row.page_key === 'dashboard' && !row.active) throw new Error('Dashboard can\'t be switched off');
    await q(sb.from('company_pages').upsert(row));
    await ctx.reloadAccess();
  }, 'Page saved');
  return html`<div class="stack">
    <${Head} title="Pages Management" sub=${access.pages.length + ' pages'} />
    ${!access.ready && html`<${MigrationNote} />`}
    <div class="card flush"><div class="table-wrap"><table>
      <thead><tr><th>Path</th><th>Label</th><th>Section</th><th class="num">Sort</th><th>Status</th><th class="num">Actions</th></tr></thead>
      <tbody>${access.pages.map(p => html`<tr>
        <td class="mono small">/${p.key}</td><td>${p.label}</td><td class="muted">Payroll</td><td class="num">${p.sort}</td>
        <td><${Badge} kind=${p.active ? 'ok' : ''}>${p.active ? 'Active' : 'Inactive'}<//></td>
        <td class="num"><div class="row" style="justify-content:flex-end;gap:6px">
          ${p.key !== 'dashboard' && html`<button class="sm" disabled=${busy} onClick=${() => save(p, { active: !p.active })}>${p.active ? 'Switch off' : 'Switch on'}</button>`}
          <button class="sm" onClick=${() => setEditing({ ...p })}>Edit</button></div></td></tr>`)}
        ${[['settings', 'Settings'], ['roles', 'Roles & Permissions'], ['users', 'User Management'], ['pages', 'Pages Management'], ['role-pages', 'Role-Page Assignment']].map(([k, l]) => html`<tr>
          <td class="mono small">/${k}</td><td>${l}</td><td class="muted">Settings</td><td class="num">—</td>
          <td><${Badge} kind="ok">Active<//></td><td class="num small muted">Always on</td></tr>`)}</tbody>
    </table></div></div>
    <p class="small muted" style="margin:0">Settings pages are admin-only and always on, so an admin can never lock themselves out.</p>
    ${editing && html`<${Modal} title=${'Edit page — /' + editing.key} onClose=${() => setEditing(null)}>
      <form class="stack" onSubmit=${e => { e.preventDefault();
        if (editing.label.trim().length < 2) return;
        save(editing, { label: editing.label.trim(), sort_order: Number(editing.sort) || 0 }).then(() => setEditing(null)); }}>
        <div class="grid g2">
          <${Field} label="Display label" hint=${'Default: ' + editing.defaultLabel}><input required minlength="2" maxlength="40" value=${editing.label} onInput=${e => setEditing({ ...editing, label: e.target.value })} /><//>
          <${Field} label="Sort order" hint="Lower numbers come first in the menu"><input type="number" value=${editing.sort} onInput=${e => setEditing({ ...editing, sort: e.target.value })} /><//>
        </div>
        <div class="row"><span class="spacer" /><button type="button" onClick=${() => setEditing(null)}>Cancel</button><button class="primary" disabled=${busy}>Save</button></div>
      </form><//>`}
  </div>`;
}

/* ------------------------------------------------------------------ Role-Page Assignment */
export function RolePageAssignment({ ctx, access }) {
  const cid = ctx.company.id;
  const [roleKey, setRoleKey] = useState('hr');
  const [busy, act] = useAction();
  if (!ctx.can.admin) return html`<${AdminOnly} />`;
  const roles = access.roles;
  const role = access.roleOf(roleKey) || roles[0];
  const pages = access.pages;
  const total = pages.length + 5;   // + the 5 Settings pages
  const isAdmin = role.base === 'admin', isEmp = role.base === 'employee';
  const readOnlyBase = !BASE[role.base].canEdit;
  const count = r => r.base === 'admin' ? total : r.base === 'employee' ? 0 : pages.filter(p => access.grant(r.key, p.key).view).length;

  // Every tick saves straight away (as in the reference). Ticking a page gives open + edit; the Edit chip takes edit away.
  const persist = changes => act(async () => {
    await q(sb.from('company_role_pages').upsert(changes.map(([page, view, edit]) => ({ company_id: cid, role: role.key, page_key: page, can_view: view, can_edit: edit }))))
      .catch(needs('009_custom_roles.sql'));
    await ctx.reloadAccess();
  });
  const g = k => access.grant(role.key, k);
  const allOn = pages.every(p => g(p.key).view), someOn = pages.some(p => g(p.key).view);

  return html`<div class="stack">
    <${Head} title="Role-Page Assignment" sub="Assign pages to each role" />
    ${!access.ready && html`<${MigrationNote} />`}
    <div class="grid rp-grid" style="grid-template-columns:minmax(240px,1fr) 2fr;align-items:start">
      <div class="card flush">
        <div class="rp-head">Roles & Permissions</div>
        ${roles.map(r => html`<button class=${'rp-role' + (r.key === role.key ? ' on' : '')} onClick=${() => setRoleKey(r.key)}>
          <span class="rp-link"><${Ic} n="link" /></span>
          <span style="flex:1"><b>${r.name}${!r.active && html` <small style="display:inline">(inactive)</small>`}</b>
            <small>${r.key === 'admin' ? 'Full access to all pages' : r.base === 'employee' ? 'My payslips only' : r.description || '—'}</small></span>
          <span class="small muted">${count(r)}/${total}</span></button>`)}
      </div>
      <div class="card flush">
        <div class="rp-head row between"><span>${role.name}</span><span class="small muted" style="text-transform:none;letter-spacing:0">${count(role)}/${total} pages assigned</span></div>
        <div style="padding:16px" class="stack">
          ${isAdmin && html`<div class="notice info">Admin always has full access to every page.</div>`}
          ${isEmp && html`<div class="notice info">Roles with Employee data access only see <b>My payslips</b> (their own payslips from locked payroll runs).</div>`}
          ${!isAdmin && !isEmp && readOnlyBase && html`<div class="notice info">${role.name} has ${BASE[role.base].name} data access, so its pages are view-only (payroll can still be run and locked).</div>`}
          ${!isEmp && html`
            <div>
              <label class="check rp-module"><input type="checkbox" checked=${isAdmin || allOn} disabled=${isAdmin || busy}
                ref=${el => { if (el) el.indeterminate = !isAdmin && !allOn && someOn; }}
                onChange=${e => persist(pages.map(p => [p.key, e.target.checked, e.target.checked]))} /> Payroll</label>
              <div class="grid g3 rp-pages">${pages.map(p => { const c = g(p.key); return html`<div>
                <label class=${'check' + (p.active ? '' : ' muted')}><input type="checkbox" checked=${c.view} disabled=${isAdmin || busy}
                  onChange=${e => persist([[p.key, e.target.checked, e.target.checked]])} /> ${p.label}${!p.active && ' (off)'}</label>
                ${c.view && !isAdmin && EDITABLE_PAGES.includes(p.key) && !readOnlyBase && html`<div class="rp-chips">
                  <button type="button" class=${'rp-chip' + (c.edit ? ' on' : '')} disabled=${busy} title=${(c.edit ? 'Can' : 'Cannot') + ' add, edit or delete here — click to change'}
                    onClick=${() => persist([[p.key, true, !c.edit]])}>Edit</button></div>`}
              </div>`; })}</div>
            </div>
            <div>
              <label class="check rp-module"><input type="checkbox" checked=${isAdmin} disabled /> Settings</label>
              <div class="grid g3 rp-pages">${['Settings', 'Roles & Permissions', 'User Management', 'Pages Management', 'Role-Page Assignment'].map(l => html`<label class="check muted"><input type="checkbox" checked=${isAdmin} disabled /> ${l}</label>`)}</div>
              ${!isAdmin && html`<p class="small muted" style="margin:6px 0 0 24px">Settings pages are admin only.</p>`}
            </div>`}
        </div>
      </div>
    </div>
  </div>`;
}
