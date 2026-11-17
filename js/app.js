import { html, render, useState, useEffect, sb, q } from './lib.js';
import { Loading, Field, INDIAN_STATES, useAction, Modal, PasswordInput } from './ui.js';
import { toast, navigate, loginEmail, loginName } from './util.js';
import { Setup } from './pages/setup.js';
import { Dashboard } from './pages/dashboard.js';
import { Employees, EmployeeProfile } from './pages/employees.js';
import { Structures } from './pages/structures.js';
import { Leaves } from './pages/leaves.js';
import { Payroll } from './pages/payroll.js';
import { Payslips } from './pages/payslips.js';
import { Reports } from './pages/reports.js';
import { Settings } from './pages/settings.js';
import { Portal } from './pages/portal.js';
import { Companies } from './pages/companies.js';
import { RolesPermissions, UserManagement, PagesManagement, RolePageAssignment } from './pages/admin.js';
import { loadAccess, visiblePages, PAGES, SETTINGS_PAGES } from './access.js';

// Lucide-style line icons (inline SVG, no build step).
const ICONS = {
  dashboard: html`<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
  employees: html`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  structures: html`<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  leaves: html`<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>`,
  payroll: html`<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>`,
  payslips: html`<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>`,
  reports: html`<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>`,
  settings: html`<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
  companies: html`<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`,
  roles: html`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
  users: html`<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><circle cx="18" cy="18" r="3"/><path d="m21.7 19.4-.9-.3"/><path d="m15.2 16.9-.9-.4"/><path d="m16.6 21.7.3-.9"/><path d="m19.1 15.2.4-.9"/><path d="m19.6 21.7-.4-1"/><path d="m16.9 15.2-.4-1"/><path d="m15.2 19.1-.9.4"/><path d="m21.7 16.6-.9.4"/>`,
  pages: html`<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>`,
  'role-pages': html`<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>`,
  logout: html`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>`,
  menu: html`<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>`,
  mail: html`<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>`,
  lock: html`<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  eye: html`<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`,
  eyeOff: html`<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>`,
};
const Icon = ({ name }) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function useHash() {
  const [hash, setHash] = useState(location.hash.slice(1) || '/dashboard');
  useEffect(() => {
    const h = () => setHash(location.hash.slice(1) || '/dashboard');
    addEventListener('hashchange', h); return () => removeEventListener('hashchange', h);
  }, []);
  return hash;
}

// ---------------------------------------------------------------- auth
function Auth() {
  const [mode, setMode] = useState('signin');
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, act] = useAction();
  const [msg, setMsg] = useState('');
  const submit = e => {
    e.preventDefault();
    act(async () => {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email: loginEmail(f.email), password: f.password });
        if (error) throw error;
      } else {
        if (loginEmail(f.email).endsWith('@payroll.local')) throw new Error('Username logins have no mailbox. Ask your administrator to reset your password.');
        const { error } = await sb.auth.resetPasswordForEmail(loginEmail(f.email), { redirectTo: location.origin });
        if (error) throw error;
        setMsg('Password reset link sent.');
      }
    });
  };
  const [showPw, setShowPw] = useState(false);
  const switchMode = m => { setMode(m); setMsg(''); };
  return html`<div class="login">
    <div class="login-head">
      <div class="logo-tile">P</div>
      <h1>Payroll</h1>
      <p>Payslips for any company, in one click.</p>
    </div>
    <div class="login-card">
      <h2>${mode === 'signin' ? 'Welcome back' : 'Reset password'}</h2>
      <p class="sub">${mode === 'signin' ? 'Sign in to continue to your dashboard' : 'We will email you a reset link'}</p>
      <form onSubmit=${submit}>
        <div>
          <label class="lbl" for="login-email">Username or email</label>
          <div class="ibox"><${Icon} name="mail" />
            <input id="login-email" type="text" required autocomplete="username" placeholder="admin or you@company.com"
              value=${f.email} onInput=${e => setF({ ...f, email: e.target.value })} />
          </div>
        </div>
        ${mode !== 'reset' && html`<div>
          <label class="lbl" for="login-pw">Password</label>
          <div class="ibox"><${Icon} name="lock" />
            <input id="login-pw" type=${showPw ? 'text' : 'password'} required minlength="6" placeholder="Password"
              autocomplete="current-password"
              value=${f.password} onInput=${e => setF({ ...f, password: e.target.value })} />
            <button type="button" class="eye" onClick=${() => setShowPw(v => !v)} aria-label=${showPw ? 'Hide password' : 'Show password'} title=${showPw ? 'Hide password' : 'Show password'}>
              <${Icon} name=${showPw ? 'eyeOff' : 'eye'} /></button>
          </div>
        </div>`}
        ${mode === 'signin' && html`<div class="forgot"><button type="button" class="link" onClick=${() => switchMode('reset')}>Forgot Password?</button></div>`}
        ${msg && html`<div class="notice info">${msg}</div>`}
        <button class="primary" disabled=${busy}>${busy ? 'Please wait…' : mode === 'signin' ? 'Login' : 'Send reset link'}</button>
        ${mode === 'signin'
          ? html`<div class="alt">No account? Ask your administrator to create one in Settings → Users & roles.</div>`
          : html`<div class="alt"><button type="button" class="link" onClick=${() => switchMode('signin')}>Back to sign in</button></div>`}
      </form>
    </div>
  </div>`;
}

function SetPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [busy, act] = useAction();
  return html`<div class="auth"><form class="card stack" onSubmit=${e => { e.preventDefault(); act(async () => {
    const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; onDone();
  }, 'Password updated'); }}>
    <h3>Choose a new password</h3>
    <${PasswordInput} minlength="6" required autocomplete="new-password" value=${pw} onInput=${e => setPw(e.target.value)} />
    <button class="primary" disabled=${busy}>Save password</button>
  </form></div>`;
}

// ---------------------------------------------------------------- change own password
function ChangePassword({ onClose }) {
  const [f, setF] = useState({ pw: '', pw2: '' });
  const [busy, act] = useAction();
  const save = e => { e.preventDefault(); act(async () => {
    if (f.pw.length < 6) throw new Error('Password must be at least 6 characters');
    if (f.pw !== f.pw2) throw new Error('The two passwords don\'t match');
    const { error } = await sb.auth.updateUser({ password: f.pw }); if (error) throw error;
    onClose();
  }, 'Password changed'); };
  return html`<${Modal} title="Change password" onClose=${onClose}>
    <form class="stack" onSubmit=${save}>
      <${Field} label="New password" hint="At least 6 characters"><${PasswordInput} autocomplete="new-password" required value=${f.pw} onInput=${e => setF({ ...f, pw: e.target.value })} /><//>
      <${Field} label="Repeat new password"><${PasswordInput} autocomplete="new-password" required value=${f.pw2} onInput=${e => setF({ ...f, pw2: e.target.value })} /><//>
      <div class="row"><span class="spacer" /><button type="button" onClick=${onClose}>Cancel</button><button class="primary" disabled=${busy}>Save password</button></div>
    </form><//>`;
}

// ---------------------------------------------------------------- no company
function NoCompany({ email }) {
  return html`<div class="auth"><div class="card stack">
    <h2>No company yet</h2>
    <p class="muted" style="margin:0">Your login (${email}) isn't linked to a company. Ask your administrator to add you.</p>
    <div class="row"><span class="spacer" /><button onClick=${() => sb.auth.signOut()}>Logout</button></div>
  </div></div>`;
}

// ---------------------------------------------------------------- shell
function Shell({ session }) {
  const hash = useHash();
  const [memberships, setMemberships] = useState(null);
  const [cid, setCid] = useState(localStorage.getItem('company_id'));
  const [platform, setPlatform] = useState(null);   // null = still checking
  const [access, setAccess] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const load = async () => {
    const rows = await q(sb.from('company_users').select('role, company:companies(*)').eq('user_id', session.user.id));
    const list = rows.filter(r => r.company).sort((a, b) => a.company.name.localeCompare(b.company.name));
    setMemberships(list);
    return list;
  };
  useEffect(() => {
    load().catch(e => toast(e.message, 'err'));
    // Super admin (may create companies). Before migration 005 the call fails: treat as no.
    sb.rpc('is_platform_admin').then(({ data }) => setPlatform(data === true), () => setPlatform(false));
  }, [session.user.id]);
  const curId = memberships && (memberships.find(m => m.company.id === cid) || memberships[0])?.company.id;
  const reloadAccess = async () => { if (curId) setAccess({ ...(await loadAccess(curId)), cid: curId }); };
  useEffect(() => { reloadAccess(); }, [curId]);
  const openCompany = id => { localStorage.setItem('company_id', id); setCid(id); };

  if (!memberships || platform === null || (memberships.length && (!access || access.cid !== curId))) return html`<${Loading} />`;
  if (!memberships.length && !platform) return html`<${NoCompany} email=${session.user.email} />`;
  // Super admin with no company yet: full menu, only Companies works until a company exists.
  const console_ = !memberships.length;
  const current = memberships.find(m => m.company.id === cid) || memberships[0];
  const company = console_ ? { id: null, name: 'Payroll' } : current.company;
  const role = console_ ? 'admin' : current.role;
  const roleKey = console_ ? 'admin' : current.role_key || role;   // custom role (009) or the system role
  const roleLabel = console_ ? 'Super admin' : (access.roleOf(roleKey) || access.roleOf(role) || { name: role }).name;
  const ctx = {
    user: session.user, company, role,
    can: {
      edit: role === 'admin' || role === 'hr',
      payroll: role !== 'employee',
      admin: role === 'admin',
      platform,
    },
    reload: load,
    reloadAccess,
  };
  const switchCompany = id => {
    if (id === '__new') { navigate('/companies'); return; }
    openCompany(id); navigate('/dashboard');
  };
  const signOut = () => sb.auth.signOut();

  const initial = (loginName(session.user.email) || 'U')[0].toUpperCase();
  const frame = (navLinks, title, body) => html`<div class=${'layout' + (menuOpen ? ' open' : '')}>
    <aside class="sidebar">
      <div class="side-brand">
        <div class="logo-tile">${(company.name || 'P')[0].toUpperCase()}</div>
        <div style="min-width:0">
          <div class="name" title=${company.name}>${company.name}</div>
          ${!console_ && (memberships.length > 1 || platform) && html`<select value=${company.id} onChange=${e => switchCompany(e.target.value)} title="Switch company">
            ${memberships.map(m => html`<option value=${m.company.id}>${m.company.id === company.id ? 'Switch company ▾' : m.company.name}</option>`)}
            ${platform && html`<option value="__new">+ Add a company</option>`}
          </select>`}
        </div>
      </div>
      <nav class="side-nav" onClick=${() => setMenuOpen(false)}>${navLinks}</nav>
      <div class="side-foot">
        <div class="side-user"><div class="avatar">${initial}</div>
          <div class="who"><p title=${session.user.email}>${loginName(session.user.email)}</p><p>${roleLabel}</p></div></div>
        <button class="logout" onClick=${() => setPwOpen(true)}><${Icon} name="lock" /> Change password</button>
        <button class="logout" onClick=${signOut}><${Icon} name="logout" /> Logout</button>
      </div>
    </aside>
    <div class="side-backdrop" onClick=${() => setMenuOpen(false)}></div>
    <div class="main-col">
      <header class="topbar">
        <button class="menu-btn" aria-label="Menu" title="Menu" onClick=${() => setMenuOpen(o => !o)}><${Icon} name="menu" /></button>
        <h1>${title}</h1>
      </header>
      ${body}
    </div>
    ${pwOpen && html`<${ChangePassword} onClose=${() => setPwOpen(false)} />`}
  </div>`;

  if (console_) {
    // No company yet: show the whole menu; every page but Companies asks for a company first.
    const want = hash.split('?')[0].replace(/^\//, '').split('/')[0] || 'companies';
    const items = [...PAGES, ...SETTINGS_PAGES];
    const cur = items.some(([k]) => k === want) ? want : 'companies';
    const link = ([k, label]) => html`<a href=${'#/' + k} class=${cur === k ? 'active' : ''}><${Icon} name=${k} /> ${label}</a>`;
    const body = cur === 'companies'
      ? html`<${Companies} ctx=${ctx} memberships=${memberships} onOpen=${() => {}}
          onCreated=${async id => { openCompany(id); await load(); navigate('/companies'); }} />`
      : html`<div class="card empty stack" style="align-items:center">
          <p style="margin:0">Create a company first. This page works inside a company.</p>
          <button class="primary" onClick=${() => navigate('/companies')}>Go to Companies</button></div>`;
    return frame(html`${PAGES.map(link)}<div class="side-section">Settings</div>${[...SETTINGS_PAGES, ['companies', 'Companies']].map(link)}`,
      (items.find(([k]) => k === cur) || [, 'Companies'])[1], html`<main>${body}</main>`);
  }

  if (role === 'employee') {
    return frame(html`<a class="active"><${Icon} name="payslips" /> My payslips</a>`, 'My payslips', html`<main><${Portal} ctx=${ctx} /></main>`);
  }

  // First-run wizard for admins.
  const [pathPart, queryPart = ''] = hash.split('?');
  const query = new URLSearchParams(queryPart);
  const [path, ...rest] = pathPart.replace(/^\//, '').split('/');
  const needsSetup = role === 'admin' && company.setup_step <= 5;
  const pages = visiblePages(access, roleKey);
  const settingsPages = role === 'admin' ? SETTINGS_PAGES : [];
  const allowed = k => k === 'setup' || pages.some(p => p.key === k) || settingsPages.some(([s]) => s === k) || (platform && k === 'companies');
  const want = needsSetup && path !== 'settings' && !(platform && path === 'companies') ? 'setup' : path;
  // Pages the role may not open (Role-Page Assignment / switched off) fall back to the first allowed page.
  const page = allowed(want) ? want : (pages[0]?.key || 'dashboard');
  // Role-Page Assignment can make a page view-only for this role.
  ctx.can.edit = ctx.can.edit && (page === 'setup' || settingsPages.some(([k]) => k === page) || access.grant(roleKey, page).edit);
  ctx.roleKey = roleKey;

  let body;
  switch (page) {
    case 'setup': body = html`<${Setup} ctx=${ctx} />`; break;
    case 'employees': body = rest[0]
      ? html`<${EmployeeProfile} ctx=${ctx} id=${rest[0]} tab=${rest[1] || 'personal'} />`
      : html`<${Employees} ctx=${ctx} />`; break;
    case 'structures': body = html`<${Structures} ctx=${ctx} />`; break;
    case 'leaves': body = html`<${Leaves} ctx=${ctx} query=${query} />`; break;
    case 'payroll': body = html`<${Payroll} ctx=${ctx} month=${rest[0]} />`; break;
    case 'payslips': body = html`<${Payslips} ctx=${ctx} month=${rest[0]} />`; break;
    case 'reports': body = html`<${Reports} ctx=${ctx} month=${rest[0]} />`; break;
    case 'companies': body = platform
      ? html`<${Companies} ctx=${ctx} memberships=${memberships} onOpen=${id => { openCompany(id); navigate('/dashboard'); }}
          onCreated=${async id => { await load(); openCompany(id); navigate('/setup'); }} />`
      : html`<${Dashboard} ctx=${ctx} />`; break;
    case 'roles': body = html`<${RolesPermissions} ctx=${ctx} access=${access} />`; break;
    case 'users': body = html`<${UserManagement} ctx=${ctx} access=${access} />`; break;
    case 'pages': body = html`<${PagesManagement} ctx=${ctx} access=${access} />`; break;
    case 'role-pages': body = html`<${RolePageAssignment} ctx=${ctx} access=${access} />`; break;
    case 'settings': body = html`<${Settings} ctx=${ctx} tab=${rest[0] || 'profile'} />`; break;
    case 'dashboard': body = html`<${Dashboard} ctx=${ctx} />`; break;
    default: body = html`<div class="card empty">You don't have access to any pages yet. Ask your administrator.</div>`;
  }
  const link = ([k, label]) => html`<a href=${'#/' + k} class=${page === k ? 'active' : ''}><${Icon} name=${k} /> ${label}</a>`;
  const admin = [...settingsPages, ...(platform ? [['companies', 'Companies']] : [])];
  const all = [...pages.map(p => [p.key, p.label]), ...admin];
  const title = page === 'setup' ? 'Setup' : (all.find(([k]) => k === page) || [, ''])[1];
  return frame(html`${pages.map(p => link([p.key, p.label]))}
      ${admin.length > 0 && html`<div class="side-section">Settings</div>${admin.map(link)}`}`,
    title, html`<main key=${company.id}>${body}</main>`);
}

function App() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return html`<${Loading} />`;
  if (recovery) return html`<${SetPassword} onDone=${() => setRecovery(false)} />`;
  return session ? html`<${Shell} session=${session} />` : html`<${Auth} />`;
}

render(html`<${App} />`, document.getElementById('app'));
