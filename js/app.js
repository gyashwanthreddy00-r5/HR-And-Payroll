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
  return html`<div class="auth">
    <h1 style="text-align:center">Payroll</h1>
    <p class="muted" style="text-align:center;margin-top:-6px">Payslips for any company, in one click.</p>
    <form class="card stack" onSubmit=${submit}>
      <h3>${mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h3>
      <${Field} label="Email"><input type="email" required value=${f.email} onInput=${e => setF({ ...f, email: e.target.value })} /><//>
      ${mode !== 'reset' && html`<${Field} label="Password"><input type="password" required minlength="6" value=${f.password} onInput=${e => setF({ ...f, password: e.target.value })} /><//>`}
      ${msg && html`<div class="notice info">${msg}</div>`}
      <button class="primary" disabled=${busy}>${busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}</button>
      <div class="row between small">
        ${mode === 'signin'
          ? html`<button type="button" class="link" onClick=${() => setMode('signup')}>Create an account</button><button type="button" class="link" onClick=${() => setMode('reset')}>Forgot password?</button>`
          : html`<button type="button" class="link" onClick=${() => { setMode('signin'); setMsg(''); }}>Back to sign in</button>`}
      </div>
    </form>
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

  const header = (nav) => html`<header class="topbar">
    <div class="company-switch">
      <span class="brand">${company.name}</span>
      <select value=${company.id} onChange=${e => switchCompany(e.target.value)} title="Switch company">
        ${memberships.map(m => html`<option value=${m.company.id}>${m.company.id === company.id ? 'Switch company ▾' : m.company.name}</option>`)}
        <option value="__new">+ Add a company</option>
      </select>
    </div>
    ${nav}
    <div class="user-menu"><span>${session.user.email} · ${role}</span><button class="sm" onClick=${signOut}>Sign out</button></div>
  </header>`;

  if (role === 'employee') {
    return html`${header(html`<nav class="nav"><a class="active">My payslips</a></nav>`)}<main><${Portal} ctx=${ctx} /></main>`;
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
  return html`${header(html`<nav class="nav">${NAV.map(([k, label]) =>
      html`<a href=${'#/' + k} class=${page === k ? 'active' : ''}>${label}</a>`)}</nav>`)}
    <main key=${company.id}>${body}</main>`;
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
