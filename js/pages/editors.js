// Reusable editors for company configuration (used by Setup, Settings, Structures).
import { html, useState, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Field, Badge, INDIAN_STATES } from '../ui.js';
import { listComponents, listLeaveTypes, listHolidays, listPtSlabs } from '../data.js';
import { ruleLabel, employerPf } from '../engine.js';
import { fmtDate, fmt } from '../util.js';

const CALC_TYPES = [
  ['fixed', 'Fixed amount'], ['pct_gross', '% of Gross'], ['pct_basic', '% of Basic'],
  ['pct_ctc', '% of CTC'], ['balance', 'Balance of gross'], ['formula', 'Formula'],
];

// ------------------------------------------------------------ pay rules form
const ER_PF_TYPES = [
  ['EPF', 'EPF', 'Whole employer share credited to EPF (no pension split)'],
  ['EPS', 'EPS', 'Split: EPS 8.33% (wages up to ₹15,000) + EPF balance 3.67%'],
  ['EDLI', 'EDLI', 'EPF/EPS split, plus EDLI insurance and EPF admin charges'],
];
const ER_PF_PAID_BY = [['employer', 'Company (Employer)'], ['employee', 'Employee']];
const numIn = v => (v === '' ? '' : Number(v));
const FieldErr = ({ msg }) => msg ? html`<span class="small" style="color:var(--bad)">${msg}</span>` : null;

/** Validation for the pay rules form; returns { field: message }. */
export function payRuleErrors(c) {
  const e = {};
  const pct = (k, label) => {
    const v = c[k];
    if (v === '' || v === null || v === undefined || isNaN(v)) e[k] = `${label} is required`;
    else if (v < 0 || v > 100) e[k] = `${label} must be between 0 and 100`;
  };
  const amt = (k, label) => {
    const v = c[k];
    if (v === '' || v === null || v === undefined || isNaN(v)) e[k] = `${label} is required`;
    else if (v < 0) e[k] = `${label} can't be negative`;
  };
  if (c.er_pf_enabled) {
    pct('er_pf_rate', 'Employer PF rate');
    amt('er_pf_cap', 'PF wage ceiling');
    if (!['EPF', 'EPS', 'EDLI'].includes(c.er_pf_type)) e.er_pf_type = 'Choose a contribution type';
    if (!['employer', 'employee'].includes(c.er_pf_paid_by || 'employer')) e.er_pf_paid_by = 'Choose who pays the contribution';
    if (c.er_pf_type === 'EDLI') { pct('er_edli_rate', 'EDLI rate'); pct('er_admin_rate', 'Admin charges'); }
  }
  return e;
}

function EmployerPfCard({ c, set, errors = {} }) {
  const on = !!c.er_pf_enabled;
  const sample = 15000;
  const valid = !Object.keys(payRuleErrors(c)).length;
  const preview = on && valid ? employerPf({ company: c, pfWages: sample, employee: {}, isMember: true }) : null;
  const t = ER_PF_TYPES.find(x => x[0] === c.er_pf_type);
  const paidByEmployee = c.er_pf_paid_by === 'employee';
  return html`<div class="card stack">
    <label class="check"><input type="checkbox" checked=${on} onChange=${e => set({ ...c, er_pf_enabled: e.target.checked })} /> <b>Employer Provident Fund (Employer PF)</b></label>
    <div class="grid g2">
      <${Field} label="Employer PF rate %"><input type="number" step="0.01" min="0" max="100" value=${c.er_pf_rate ?? ''} disabled=${!on} onInput=${e => set({ ...c, er_pf_rate: numIn(e.target.value) })} /><${FieldErr} msg=${errors.er_pf_rate} /><//>
      <${Field} label="PF wage ceiling ₹" hint="0 = contribute on actual wages"><input type="number" min="0" value=${c.er_pf_cap ?? ''} disabled=${!on} onInput=${e => set({ ...c, er_pf_cap: numIn(e.target.value) })} /><${FieldErr} msg=${errors.er_pf_cap} /><//>
    </div>
    <${Field} label="Employer PF contribution type" hint=${t ? t[2] : ''}>
      <select value=${c.er_pf_type || 'EDLI'} disabled=${!on} onChange=${e => set({ ...c, er_pf_type: e.target.value })}>${ER_PF_TYPES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>
      <${FieldErr} msg=${errors.er_pf_type} />
    <//>
    <${Field} label="EPF contribution paid by">
      <select value=${c.er_pf_paid_by || 'employer'} disabled=${!on} onChange=${e => set({ ...c, er_pf_paid_by: e.target.value })}>
        ${ER_PF_PAID_BY.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
      </select>
      <${FieldErr} msg=${errors.er_pf_paid_by} />
    <//>
    ${on && html`<div class=${'notice ' + (paidByEmployee ? '' : 'info')}>${paidByEmployee
      ? html`<b>Employee bears the cost.</b> The employer's EPF + EPS share${preview ? ` (₹${fmt(preview.pf)} on ₹${fmt(sample)} wages)` : ''} is deducted from the employee's salary as a separate line, <i>Employer PF share (borne by employee)</i>, and reduces net pay. It's still remitted to EPFO as the employer share. EDLI and admin charges stay with the company. Before choosing this, check that it's allowed: the EPF Act restricts recovering the employer's share from wages.`
      : html`<b>Company bears the cost.</b> The employer's EPF + EPS share${preview ? ` (₹${fmt(preview.pf)} on ₹${fmt(sample)} wages)` : ''} is a company payroll expense, shown under Employer Contributions on the payslip and not deducted from net pay.`}
      <div class="small" style="margin-top:4px">Applies to new and re-run payrolls. Locked payrolls are not changed.</div></div>`}
    ${c.er_pf_type === 'EDLI' && html`<div class="grid g2">
      <${Field} label="EDLI rate %" hint="On wages up to ₹15,000"><input type="number" step="0.01" min="0" max="100" value=${c.er_edli_rate ?? ''} disabled=${!on} onInput=${e => set({ ...c, er_edli_rate: numIn(e.target.value) })} /><${FieldErr} msg=${errors.er_edli_rate} /><//>
      <${Field} label="EPF admin charges %"><input type="number" step="0.01" min="0" max="100" value=${c.er_admin_rate ?? ''} disabled=${!on} onInput=${e => set({ ...c, er_admin_rate: numIn(e.target.value) })} /><${FieldErr} msg=${errors.er_admin_rate} /><//>
    </div>`}
    <p class="small muted" style="margin:0">${preview
      ? html`Calculated automatically on eligible PF wages (earned Basic). On ₹${fmt(sample)}: ${preview.lines.map(l => `${l.name.replace('Employer ', '')} ₹${fmt(l.amount)}`).join(' · ')} = <b>₹${fmt(preview.total)}</b>.`
      : on ? 'Fix the fields above to see the calculation.' : 'Employer PF is off: no employer contribution is calculated.'}</p>
  </div>`;
}

export function PayRulesForm({ c, set, errors }) {
  errors = errors || payRuleErrors(c);
  const offs = c.weekly_offs || [];
  const toggleOff = d => set({ ...c, weekly_offs: offs.includes(d) ? offs.filter(x => x !== d) : [...offs, d].sort() });
  return html`<div class="stack">
    <div class="grid g3">
      <${Field} label="Pay cycle"><input value=${c.pay_cycle || ''} onInput=${e => set({ ...c, pay_cycle: e.target.value })} /><//>
      <${Field} label="Weekly offs">
        <div class="row" style="min-height:38px">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) =>
          html`<label class="check small"><input type="checkbox" checked=${offs.includes(i)} onChange=${() => toggleOff(i)} />${d}</label>`)}</div>
      <//>
      <${Field} label="LOP day basis" hint="How a 'day' is counted when deducting leave">
        <select value=${c.lop_basis} onChange=${e => set({ ...c, lop_basis: e.target.value })}>
          <option value="calendar">Calendar days in month</option>
          <option value="fixed30">Fixed 30 days</option>
          <option value="working">Working days only</option>
        </select>
      <//>
      <${Field} label="Company state (for PT)">
        <select value=${c.state} onChange=${e => set({ ...c, state: e.target.value })}>${INDIAN_STATES.map(s => html`<option value=${s}>${s}</option>`)}</select>
      <//>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card stack">
        <label class="check"><input type="checkbox" checked=${c.pf_enabled} onChange=${e => set({ ...c, pf_enabled: e.target.checked })} /> <b>Employee Provident Fund (PF)</b></label>
        <div class="grid g2">
          <${Field} label="Rate %"><input type="number" step="0.01" value=${c.pf_rate} onInput=${e => set({ ...c, pf_rate: +e.target.value })} disabled=${!c.pf_enabled} /><//>
          <${Field} label="Basic cap ₹"><input type="number" value=${c.pf_cap} onInput=${e => set({ ...c, pf_cap: +e.target.value })} disabled=${!c.pf_enabled} /><//>
        </div>
        <p class="small muted" style="margin:0">Deducted from the employee's salary.</p>
      </div>
      <${EmployerPfCard} c=${c} set=${set} errors=${errors} />
      <div class="card stack">
        <label class="check"><input type="checkbox" checked=${c.esi_enabled} onChange=${e => set({ ...c, esi_enabled: e.target.checked })} /> <b>Employee State Insurance (ESI)</b></label>
        <div class="grid g2">
          <${Field} label="Rate %"><input type="number" step="0.01" value=${c.esi_rate} onInput=${e => set({ ...c, esi_rate: +e.target.value })} disabled=${!c.esi_enabled} /><//>
          <${Field} label="If gross ≤ ₹"><input type="number" value=${c.esi_limit} onInput=${e => set({ ...c, esi_limit: +e.target.value })} disabled=${!c.esi_enabled} /><//>
        </div>
      </div>
      <div class="card stack">
        <label class="check"><input type="checkbox" checked=${c.pt_enabled} onChange=${e => set({ ...c, pt_enabled: e.target.checked })} /> <b>Professional Tax (PT)</b></label>
        <p class="small muted" style="margin:0">State slabs, edit under Settings → PT slabs.</p>
        <${Field} label="TDS"><select value=${c.tds_mode} onChange=${e => set({ ...c, tds_mode: e.target.value })}><option value="manual">Manual entry each month</option></select><//>
      </div>
    </div>
  </div>`;
}

export const PAY_RULE_KEYS = ['pay_cycle','weekly_offs','lop_basis','state','pf_enabled','pf_rate','pf_cap','esi_enabled','esi_rate','esi_limit','pt_enabled','tds_mode',
  'er_pf_enabled','er_pf_rate','er_pf_cap','er_pf_type','er_edli_rate','er_admin_rate','er_pf_paid_by'];

// ------------------------------------------------------------ salary components
export function ComponentsEditor({ ctx }) {
  const cid = ctx.company.id;
  const st = useAsync(() => listComponents(cid), [cid]);
  const [edit, setEdit] = useState(null);
  const [busy, act] = useAction();
  const save = () => act(async () => {
    const row = { ...edit, company_id: cid, code: edit.code.trim().toUpperCase(), value: Number(edit.value) || 0 };
    if (row.calc_type === 'statutory' && !row.statutory_key) throw new Error('Pick a rule');
    if (row.id) await q(sb.from('salary_components').update(row).eq('id', row.id));
    else { delete row.id; await q(sb.from('salary_components').insert(row)); }
    setEdit(null); st.reload();
  }, 'Component saved');
  const del = c => confirm(`Delete component "${c.name}"? It will be removed from all structures.`) &&
    act(async () => { await q(sb.from('salary_components').delete().eq('id', c.id)); st.reload(); }, 'Deleted');

  return html`<${Async} state=${st}>${comps => html`<div class="stack">
    <div class="card flush"><div class="table-wrap"><table>
      <thead><tr><th>Component</th><th>Code</th><th>Type</th><th>Rule</th><th>Taxable</th><th>Order</th><th></th></tr></thead>
      <tbody>${comps.map(c => html`<tr>
        <td>${c.name} ${c.statutory_key && c.statutory_key !== 'basic' && html`<${Badge}>statutory<//>`}</td>
        <td class="mono">${c.code}</td>
        <td>${c.type}</td>
        <td>${ruleLabel(c, ctx.company)}</td>
        <td>${c.taxable ? 'Yes' : 'No'}</td>
        <td class="num">${c.sort_order}</td>
        <td class="num">${ctx.can.edit && html`<button class="sm" onClick=${() => setEdit({ ...c })}>Edit</button>
          ${!['pf','esi','pt','tds','basic'].includes(c.statutory_key) && html` <button class="sm danger" onClick=${() => del(c)}>Delete</button>`}`}</td>
      </tr>`)}</tbody>
    </table></div></div>
    ${ctx.can.edit && html`<div><button onClick=${() => setEdit({ name: '', code: '', type: 'earning', calc_type: 'fixed', value: 0, taxable: true, sort_order: comps.length + 1 })}>+ Add component</button></div>`}
    ${edit && html`<div class="card stack">
      <h3>${edit.id ? 'Edit' : 'New'} component</h3>
      <div class="grid g3">
        <${Field} label="Name"><input value=${edit.name} onInput=${e => setEdit({ ...edit, name: e.target.value })} /><//>
        <${Field} label="Code"><input value=${edit.code} onInput=${e => setEdit({ ...edit, code: e.target.value })} /><//>
        <${Field} label="Type"><select value=${edit.type} disabled=${!!edit.statutory_key} onChange=${e => setEdit({ ...edit, type: e.target.value })}><option value="earning">Earning</option><option value="deduction">Deduction</option></select><//>
        ${edit.calc_type === 'statutory'
          ? html`<${Field} label="Rule"><input disabled value=${ruleLabel(edit, ctx.company)} /><//>`
          : html`<${Field} label="Calculation"><select value=${edit.calc_type} onChange=${e => setEdit({ ...edit, calc_type: e.target.value })}>${CALC_TYPES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select><//>`}
        ${['fixed','pct_gross','pct_basic','pct_ctc'].includes(edit.calc_type) && html`<${Field} label=${edit.calc_type === 'fixed' ? 'Amount ₹ (monthly)' : 'Percent'}><input type="number" step="0.01" value=${edit.value} onInput=${e => setEdit({ ...edit, value: e.target.value })} /><//>`}
        ${edit.calc_type === 'formula' && html`<${Field} label="Formula" hint="Use gross, basic, ctc (monthly), annual_ctc, min(), max(), round()"><input class="mono" value=${edit.formula || ''} onInput=${e => setEdit({ ...edit, formula: e.target.value })} placeholder="min(basic * 0.1, 1600)" /><//>`}
        <${Field} label="Order"><input type="number" value=${edit.sort_order} onInput=${e => setEdit({ ...edit, sort_order: +e.target.value })} /><//>
      </div>
      <label class="check"><input type="checkbox" checked=${edit.taxable} onChange=${e => setEdit({ ...edit, taxable: e.target.checked })} /> Taxable</label>
      <div class="row"><button onClick=${() => setEdit(null)}>Cancel</button><button class="primary" disabled=${busy || !edit.name || !edit.code} onClick=${save}>Save component</button></div>
    </div>`}
  </div>`}<//>`;
}

// ------------------------------------------------------------ leave types
export function LeaveTypesEditor({ ctx }) {
  const cid = ctx.company.id;
  const st = useAsync(() => listLeaveTypes(cid), [cid]);
  const [edit, setEdit] = useState(null);
  const [busy, act] = useAction();
  const save = () => act(async () => {
    const row = { ...edit, company_id: cid, code: edit.code.trim().toUpperCase(), annual_quota: Number(edit.annual_quota) || 0 };
    if (row.id) await q(sb.from('leave_types').update(row).eq('id', row.id));
    else { delete row.id; await q(sb.from('leave_types').insert(row)); }
    setEdit(null); st.reload();
  }, 'Leave type saved');
  const del = t => confirm(`Delete leave type "${t.name}"?`) && act(async () => { await q(sb.from('leave_types').delete().eq('id', t.id)); st.reload(); });
  return html`<${Async} state=${st}>${types => html`<div class="stack">
    <div class="card flush"><table>
      <thead><tr><th>Leave type</th><th>Code</th><th>Paid</th><th class="num">Annual quota</th><th>Carry forward</th><th></th></tr></thead>
      <tbody>${types.map(t => html`<tr>
        <td>${t.name}</td><td class="mono">${t.code}</td>
        <td>${t.paid ? html`<${Badge} kind="ok">Paid<//>` : html`<${Badge} kind="bad">Unpaid · LOP<//>`}</td>
        <td class="num">${t.annual_quota}</td><td>${t.carry_forward ? 'Yes' : 'No'}</td>
        <td class="num">${ctx.can.edit && html`<button class="sm" onClick=${() => setEdit({ ...t })}>Edit</button> <button class="sm danger" onClick=${() => del(t)}>Delete</button>`}</td>
      </tr>`)}</tbody>
    </table></div>
    ${ctx.can.edit && html`<div><button onClick=${() => setEdit({ name: '', code: '', paid: true, annual_quota: 0, carry_forward: false })}>+ Add leave type</button></div>`}
    ${edit && html`<div class="card stack">
      <div class="grid g3">
        <${Field} label="Name"><input value=${edit.name} onInput=${e => setEdit({ ...edit, name: e.target.value })} /><//>
        <${Field} label="Code"><input value=${edit.code} onInput=${e => setEdit({ ...edit, code: e.target.value })} /><//>
        <${Field} label="Annual quota (days)"><input type="number" step="0.5" value=${edit.annual_quota} onInput=${e => setEdit({ ...edit, annual_quota: e.target.value })} /><//>
      </div>
      <div class="row">
        <label class="check"><input type="checkbox" checked=${edit.paid} onChange=${e => setEdit({ ...edit, paid: e.target.checked })} /> Paid (unchecked = counts as LOP)</label>
        <label class="check"><input type="checkbox" checked=${edit.carry_forward} onChange=${e => setEdit({ ...edit, carry_forward: e.target.checked })} /> Carry forward</label>
      </div>
      <div class="row"><button onClick=${() => setEdit(null)}>Cancel</button><button class="primary" disabled=${busy || !edit.name || !edit.code} onClick=${save}>Save</button></div>
    </div>`}
  </div>`}<//>`;
}

// ------------------------------------------------------------ holidays
export function HolidaysEditor({ ctx }) {
  const cid = ctx.company.id;
  const st = useAsync(() => listHolidays(cid), [cid]);
  const [f, setF] = useState({ date: '', name: '' });
  const [busy, act] = useAction();
  const add = () => act(async () => { await q(sb.from('holidays').insert({ ...f, company_id: cid })); setF({ date: '', name: '' }); st.reload(); }, 'Holiday added');
  const del = h => act(async () => { await q(sb.from('holidays').delete().eq('id', h.id)); st.reload(); });
  return html`<${Async} state=${st}>${list => html`<div class="stack">
    <div class="card flush"><table>
      <thead><tr><th>Date</th><th>Holiday</th><th></th></tr></thead>
      <tbody>${list.length ? list.map(h => html`<tr><td>${fmtDate(h.date)}</td><td>${h.name}</td><td class="num">${ctx.can.edit && html`<button class="sm danger" onClick=${() => del(h)}>Remove</button>`}</td></tr>`)
        : html`<tr><td colspan="3" class="empty">No holidays yet.</td></tr>`}</tbody>
    </table></div>
    ${ctx.can.edit && html`<div class="row">
      <input type="date" style="width:180px" value=${f.date} onInput=${e => setF({ ...f, date: e.target.value })} />
      <input style="width:260px" placeholder="Holiday name" value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} />
      <button disabled=${busy || !f.date || !f.name} onClick=${add}>Add holiday</button>
    </div>`}
  </div>`}<//>`;
}

// ------------------------------------------------------------ PT slabs
export function PtSlabsEditor({ ctx }) {
  const cid = ctx.company.id;
  const st = useAsync(() => listPtSlabs(cid), [cid]);
  const [f, setF] = useState({ min_gross: '', max_gross: '', amount: '' });
  const [busy, act] = useAction();
  const add = () => act(async () => {
    await q(sb.from('pt_slabs').insert({ company_id: cid, min_gross: +f.min_gross, max_gross: f.max_gross === '' ? null : +f.max_gross, amount: +f.amount }));
    setF({ min_gross: '', max_gross: '', amount: '' }); st.reload();
  }, 'Slab added');
  const del = s => act(async () => { await q(sb.from('pt_slabs').delete().eq('id', s.id)); st.reload(); });
  return html`<${Async} state=${st}>${list => html`<div class="stack">
    <p class="muted" style="margin:0">Monthly Professional Tax by earned gross, for ${ctx.company.state}. Defaults are Telangana's slabs.</p>
    <div class="card flush"><table>
      <thead><tr><th class="num">Gross from ₹</th><th class="num">Gross to ₹</th><th class="num">PT ₹ / month</th><th></th></tr></thead>
      <tbody>${list.map(s => html`<tr><td class="num">${s.min_gross}</td><td class="num">${s.max_gross ?? 'and above'}</td><td class="num">${s.amount}</td>
        <td class="num">${ctx.can.edit && html`<button class="sm danger" onClick=${() => del(s)}>Remove</button>`}</td></tr>`)}</tbody>
    </table></div>
    ${ctx.can.edit && html`<div class="row">
      <input type="number" style="width:150px" placeholder="From" value=${f.min_gross} onInput=${e => setF({ ...f, min_gross: e.target.value })} />
      <input type="number" style="width:150px" placeholder="To (blank = no limit)" value=${f.max_gross} onInput=${e => setF({ ...f, max_gross: e.target.value })} />
      <input type="number" style="width:130px" placeholder="PT amount" value=${f.amount} onInput=${e => setF({ ...f, amount: e.target.value })} />
      <button disabled=${busy || f.min_gross === '' || f.amount === ''} onClick=${add}>Add slab</button>
    </div>`}
  </div>`}<//>`;
}

// ------------------------------------------------------------ company profile + statutory
export function ProfileForm({ c, set, ctx }) {
  const [busy, act] = useAction();
  const upload = file => act(async () => {
    const path = `${ctx.company.id}/logo-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await sb.storage.from('logos').upload(path, file, { upsert: true });
    if (error) throw error;
    set({ ...c, logo_url: sb.storage.from('logos').getPublicUrl(path).data.publicUrl });
  }, 'Logo uploaded, save to keep it');
  return html`<div class="grid g2">
    <${Field} label="Company name"><input value=${c.name || ''} onInput=${e => set({ ...c, name: e.target.value })} /><//>
    <${Field} label="Employee ID prefix" hint="New employees get IDs like ${c.emp_code_prefix}001"><input value=${c.emp_code_prefix || ''} onInput=${e => set({ ...c, emp_code_prefix: e.target.value })} /><//>
    <${Field} label="Address"><textarea rows="3" value=${c.address || ''} onInput=${e => set({ ...c, address: e.target.value })} /><//>
    <${Field} label="Logo">
      <div class="row">${c.logo_url && html`<img src=${c.logo_url} alt="" style="height:44px;max-width:140px;object-fit:contain" />`}
        <input type="file" accept="image/png,image/jpeg" disabled=${busy} onChange=${e => e.target.files[0] && upload(e.target.files[0])} style="width:auto" /></div>
    <//>
  </div>`;
}

export function StatutoryForm({ c, set }) {
  const f = (k, label, ph) => html`<${Field} label=${label}><input class="mono" placeholder=${ph} value=${c[k] || ''} onInput=${e => set({ ...c, [k]: e.target.value.toUpperCase() })} /><//>`;
  return html`<div class="grid g2">
    ${f('pan', 'Company PAN', 'AAACA1234A')}${f('tan', 'TAN', 'HYDA12345B')}
    ${f('pf_no', 'PF establishment code', 'APHYD0012345000')}${f('esi_no', 'ESI code', '52000123450001001')}
  </div>`;
}

export const PROFILE_KEYS = ['name', 'address', 'logo_url', 'emp_code_prefix'];
export const STATUTORY_KEYS = ['pan', 'tan', 'pf_no', 'esi_no'];

export const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
