import { html, render, useState, useEffect, sb, q } from './lib.js';
import { Loading, Field, INDIAN_STATES, useAction } from './ui.js';
import { toast, navigate } from './util.js';
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
  logout: html`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>`,
  menu: html`<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>`,
  mail: html`<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>`,
  lock: html`<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  eye: html`<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`,
  eyeOff: html`<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>`,
};
const Icon = ({ name }) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const NAV = [
  ['dashboard', 'Dashboard'], ['employees', 'Employees'], ['structures', 'Salary structures'],
  ['leaves', 'Leaves'], ['payroll', 'Run payroll'], ['payslips', 'Payslips'], ['reports', 'Reports'], ['settings', 'Settings'],
];

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
        const { error } = await sb.auth.signInWithPassword(f);
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ ...f, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) setMsg('Check your inbox to confirm your email, then sign in.');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(f.email, { redirectTo: location.origin });
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
      <h2>${mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}</h2>
      <p class="sub">${mode === 'signin' ? 'Sign in to continue to your dashboard' : mode === 'signup' ? 'Start running payroll in minutes' : 'We will email you a reset link'}</p>
      <form onSubmit=${submit}>
        <div>
          <label class="lbl" for="login-email">Email</label>
          <div class="ibox"><${Icon} name="mail" />
            <input id="login-email" type="email" required autocomplete="username" placeholder="you@company.com"
              value=${f.email} onInput=${e => setF({ ...f, email: e.target.value })} />
          </div>
        </div>
        ${mode !== 'reset' && html`<div>
          <label class="lbl" for="login-pw">Password</label>
          <div class="ibox"><${Icon} name="lock" />
            <input id="login-pw" type=${showPw ? 'text' : 'password'} required minlength="6" placeholder="Password"
              autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'}
              value=${f.password} onInput=${e => setF({ ...f, password: e.target.value })} />
            <button type="button" class="eye" onClick=${() => setShowPw(v => !v)} aria-label=${showPw ? 'Hide password' : 'Show password'} title=${showPw ? 'Hide password' : 'Show password'}>
              <${Icon} name=${showPw ? 'eyeOff' : 'eye'} /></button>
          </div>
        </div>`}
        ${mode === 'signin' && html`<div class="forgot"><button type="button" class="link" onClick=${() => switchMode('reset')}>Forgot Password?</button></div>`}
        ${msg && html`<div class="notice info">${msg}</div>`}
        <button class="primary" disabled=${busy}>${busy ? 'Please wait…' : mode === 'signin' ? 'Login' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
        <div class="alt">
          ${mode === 'signin'
            ? html`New here? <button type="button" class="link" onClick=${() => switchMode('signup')}>Create an account</button>`
            : html`<button type="button" class="link" onClick=${() => switchMode('signin')}>Back to sign in</button>`}
        </div>
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
    <input type="password" minlength="6" required value=${pw} onInput=${e => setPw(e.target.value)} />
    <button class="primary" disabled=${busy}>Save password</button>
  </form></div>`;
}

// ---------------------------------------------------------------- create company
function CreateCompany({ onCreated, onCancel }) {
  const [f, setF] = useState({ name: '', state: 'Telangana' });
  const [busy, act] = useAction();
  return html`<div class="auth" style="max-width:480px">
    <form class="card stack" onSubmit=${e => { e.preventDefault(); act(async () => {
      const id = await q(sb.rpc('create_company', { p_name: f.name.trim(), p_state: f.state }));
      onCreated(id);
    }); }}>
      <h2>Add your company</h2>
      <p class="muted" style="margin-top:-6px">We'll set up default salary components (Basic, HRA, Special, PF, ESI, PT, TDS) and leave types. You can change everything later.</p>
      <${Field} label="Company name"><input required value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} placeholder="Acme Infotech Pvt Ltd" /><//>
      <${Field} label="State (for Professional Tax)">
        <select value=${f.state} onChange=${e => setF({ ...f, state: e.target.value })}>${INDIAN_STATES.map(s => html`<option value=${s}>${s}</option>`)}</select>
      <//>
      <div class="row">
        ${onCancel && html`<button type="button" onClick=${onCancel}>Cancel</button>`}
        <span class="spacer" />
        <button class="primary" disabled=${busy || !f.name.trim()}>Create company</button>
      </div>
    </form>
  </div>`;
}

// ---------------------------------------------------------------- shell
function Shell({ session }) {
  const hash = useHash();
  const [memberships, setMemberships] = useState(null);
  const [cid, setCid] = useState(localStorage.getItem('company_id'));
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    const rows = await q(sb.from('company_users').select('role, company:companies(*)').eq('user_id', session.user.id));
    const list = rows.filter(r => r.company).sort((a, b) => a.company.name.localeCompare(b.company.name));
    setMemberships(list);
    return list;
  };
  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, [session.user.id]);

  if (!memberships) return html`<${Loading} />`;
  if (!memberships.length || adding) {
    return html`<${CreateCompany} onCancel=${memberships.length ? () => setAdding(false) : null}
      onCreated=${async id => { localStorage.setItem('company_id', id); setCid(id); setAdding(false); await load(); navigate('/setup'); }} />`;
  }
  const current = memberships.find(m => m.company.id === cid) || memberships[0];
  const company = current.company;
  const role = current.role;
  const ctx = {
    user: session.user, company, role,
    can: {
      edit: role === 'admin' || role === 'hr',
      payroll: role !== 'employee',
      admin: role === 'admin',
    },
    reload: load,
  };
  const switchCompany = id => {
    if (id === '__new') { setAdding(true); return; }
    localStorage.setItem('company_id', id); setCid(id); navigate('/dashboard');
  };
  const signOut = () => sb.auth.signOut();

  const initial = (session.user.email || 'U')[0].toUpperCase();
  const frame = (navLinks, title, body) => html`<div class=${'layout' + (menuOpen ? ' open' : '')}>
    <aside class="sidebar">
      <div class="side-brand">
        <div class="logo-tile">${(company.name || 'P')[0].toUpperCase()}</div>
        <div style="min-width:0">
          <div class="name" title=${company.name}>${company.name}</div>
          <select value=${company.id} onChange=${e => switchCompany(e.target.value)} title="Switch company">
            ${memberships.map(m => html`<option value=${m.company.id}>${m.company.id === company.id ? 'Switch company ▾' : m.company.name}</option>`)}
            <option value="__new">+ Add a company</option>
          </select>
        </div>
      </div>
      <nav class="side-nav" onClick=${() => setMenuOpen(false)}>${navLinks}</nav>
      <div class="side-foot">
        <div class="side-user"><div class="avatar">${initial}</div>
          <div class="who"><p title=${session.user.email}>${session.user.email}</p><p>${role}</p></div></div>
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
  </div>`;

  if (role === 'employee') {
    return frame(html`<a class="active"><${Icon} name="payslips" /> My payslips</a>`, 'My payslips', html`<main><${Portal} ctx=${ctx} /></main>`);
  }

  // First-run wizard for admins.
  const [pathPart, queryPart = ''] = hash.split('?');
  const query = new URLSearchParams(queryPart);
  const [path, ...rest] = pathPart.replace(/^\//, '').split('/');
  const needsSetup = role === 'admin' && company.setup_step <= 5;
  const page = needsSetup && path !== 'settings' ? 'setup' : path;

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
    case 'settings': body = html`<${Settings} ctx=${ctx} tab=${rest[0] || 'profile'} />`; break;
    default: body = html`<${Dashboard} ctx=${ctx} />`;
  }
  const title = page === 'setup' ? 'Setup' : (NAV.find(([k]) => k === page) || NAV[0])[1];
  return frame(NAV.map(([k, label]) =>
      html`<a href=${'#/' + k} class=${page === k ? 'active' : ''}><${Icon} name=${k} /> ${label}</a>`),
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
