import { html, useState, useMemo, sb, q } from '../lib.js';
import { useAsync, Async, useAction, Field, Badge } from '../ui.js';
import { listStructures, listComponents, listPtSlabs } from '../data.js';
import { mergeComponents, calculatePayroll, monthCalendar, ruleLabel } from '../engine.js';
import { fmt } from '../util.js';
import { ComponentsEditor } from './editors.js';
import { ErPfPolicy, EmployerRows, DeductionRows } from './employer.js';

const CALC = [['', 'Use component rule'], ['fixed', 'Fixed amount'], ['pct_gross', '% of Gross'], ['pct_basic', '% of Basic'], ['pct_ctc', '% of CTC'], ['balance', 'Balance of gross'], ['formula', 'Formula']];

export function Structures({ ctx }) {
  const cid = ctx.company.id;
  const [tab, setTab] = useState('structures');
  const st = useAsync(async () => {
    const [structs, comps, pt] = await Promise.all([listStructures(cid), listComponents(cid), listPtSlabs(cid)]);
    return { structs, comps, pt };
  }, [cid, tab]);
  const [sel, setSel] = useState(null);
  const [busy, act] = useAction();
  const [newName, setNewName] = useState('');

  return html`<div class="stack">
    <h1>Salary structures</h1>
    <div class="tabs"><button class=${tab === 'structures' ? 'active' : ''} onClick=${() => setTab('structures')}>Structures</button>
      <button class=${tab === 'components' ? 'active' : ''} onClick=${() => setTab('components')}>Components</button></div>
    ${tab === 'components' ? html`<div><p class="muted">Components are shared by all structures: fixed amount, % of Basic, % of Gross, % of CTC, balance or a formula. Statutory items (PF, ESI, PT, TDS) follow the switches in Settings → Pay rules.</p><${ErPfPolicy} company=${ctx.company} prefix="Employer contributions aren't components. " /><div style="height:12px"></div><${ComponentsEditor} ctx=${ctx} /></div>`
    : html`<${Async} state=${st}>${({ structs, comps, pt }) => {
      const current = structs.find(s => s.id === sel) || structs[0];
      const create = () => act(async () => {
        const s = await q(sb.from('salary_structures').insert({ company_id: cid, name: newName.trim() }).select().single());
        setNewName(''); setSel(s.id); st.reload();
      }, 'Structure created');
      return html`<div class="grid" style="grid-template-columns:240px 1fr;align-items:start">
        <div class="card flush">
          <table><tbody>${structs.map(s => html`<tr class="click" onClick=${() => setSel(s.id)}><td style=${current?.id === s.id ? 'font-weight:600;background:#fbfaf8' : ''}>${s.name}<div class="small muted">${(s.structure_components || []).length} components</div></td></tr>`)}</tbody></table>
          ${ctx.can.edit && html`<div style="padding:10px" class="stack"><input placeholder="New structure name" value=${newName} onInput=${e => setNewName(e.target.value)} /><button disabled=${busy || !newName.trim()} onClick=${create}>+ Create structure</button></div>`}
        </div>
        ${current ? html`<${StructureEditor} key=${current.id} ctx=${ctx} s=${current} comps=${comps} pt=${pt} reload=${st.reload} />` : html`<div class="empty">Create a structure to begin.</div>`}
      </div>`;
    }}<//>`}
  </div>`;
}

function StructureEditor({ ctx, s, comps, pt, reload }) {
  const [rows, setRows] = useState((s.structure_components || []).slice().sort((a, b) => a.sort_order - b.sort_order));
  const [meta, setMeta] = useState({ name: s.name, description: s.description || '' });
  const [sample, setSample] = useState(60000);
  const [busy, act] = useAction();
  const ro = !ctx.can.edit;
  const used = new Set(rows.map(r => r.component_id));
  const available = comps.filter(c => !used.has(c.id));
  const byId = new Map(comps.map(c => [c.id, c]));

  const preview = useMemo(() => {
    try {
      const mc = mergeComponents(rows, comps);
      return calculatePayroll({ company: ctx.company, salary: { monthly_gross: sample, annual_ctc: sample * 12 }, comps: mc, cal: monthCalendar(2026, 1, []), ptSlabs: pt });
    } catch (e) { return { error: e.message }; }
  }, [rows, sample]);

  const upd = (i, patch) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const move = (i, d) => { const r = rows.slice(); const j = i + d; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; setRows(r); };
  const save = () => act(async () => {
    await q(sb.from('salary_structures').update({ name: meta.name, description: meta.description }).eq('id', s.id));
    await q(sb.from('structure_components').delete().eq('structure_id', s.id));
    if (rows.length) await q(sb.from('structure_components').insert(rows.map((r, i) => ({
      company_id: ctx.company.id, structure_id: s.id, component_id: r.component_id, sort_order: i + 1,
      calc_type: r.calc_type || null, value: r.calc_type ? (r.value === '' || r.value === null ? null : Number(r.value)) : null,
      formula: r.calc_type === 'formula' ? r.formula : null,
    }))));
    reload();
  }, 'Structure saved');
  const del = () => confirm(`Delete structure "${s.name}"? Employees using it must be moved first.`) &&
    act(async () => { await q(sb.from('salary_structures').delete().eq('id', s.id)); reload(); }, 'Deleted');

  return html`<div class="card stack">
    <div class="grid g2">
      <${Field} label="Structure name"><input disabled=${ro} value=${meta.name} onInput=${e => setMeta({ ...meta, name: e.target.value })} /><//>
      <${Field} label="Description"><input disabled=${ro} value=${meta.description} onInput=${e => setMeta({ ...meta, description: e.target.value })} /><//>
    </div>
    <div class="card flush"><div class="table-wrap"><table>
      <thead><tr><th></th><th>Component</th><th>Type</th><th>Rule in this structure</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => {
        const c = byId.get(r.component_id); if (!c) return null;
        const statutory = c.calc_type === 'statutory';
        return html`<tr>
          <td style="white-space:nowrap">${!ro && html`<button class="sm" onClick=${() => move(i, -1)}>↑</button><button class="sm" onClick=${() => move(i, 1)}>↓</button>`}</td>
          <td>${c.name} <span class="mono small muted">${c.code}</span></td>
          <td>${c.type}</td>
          <td>${statutory ? ruleLabel(c, ctx.company) : html`<div class="row" style="gap:6px">
            <select disabled=${ro} style="width:170px" value=${r.calc_type || ''} onChange=${e => upd(i, { calc_type: e.target.value || null, value: e.target.value ? (r.value ?? c.value) : null })}>${CALC.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>
            ${!r.calc_type ? html`<span class="small muted">${ruleLabel(c, ctx.company)}</span>`
              : r.calc_type === 'formula' ? html`<input disabled=${ro} class="inline mono" style="width:200px" value=${r.formula || ''} onInput=${e => upd(i, { formula: e.target.value })} />`
              : r.calc_type !== 'balance' ? html`<input disabled=${ro} class="inline" type="number" style="width:110px" value=${r.value ?? ''} onInput=${e => upd(i, { value: e.target.value })} />` : ''}
          </div>`}</td>
          <td class="num">${!ro && html`<button class="sm danger" onClick=${() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>`}</td>
        </tr>`;
      })}</tbody>
    </table></div></div>
    ${!ro && available.length > 0 && html`<div class="row"><select style="width:260px" onChange=${e => { if (e.target.value) { setRows([...rows, { component_id: e.target.value, calc_type: null, value: null }]); e.target.value = ''; } }}>
      <option value="">+ Add component to structure…</option>${available.map(c => html`<option value=${c.id}>${c.name} (${c.type})</option>`)}</select></div>`}

    <div class="card" style="background:#fbfaf8">
      <div class="row"><b>Preview</b><span class="muted">for a monthly gross of</span><input type="number" class="inline" style="width:120px" value=${sample} onInput=${e => setSample(Number(e.target.value) || 0)} /></div>
      ${preview.error ? html`<div class="notice bad" style="margin-top:10px">${preview.error}</div>` : html`<div class="grid g2" style="margin-top:10px">
        <table><tbody>${preview.earnings.map(e => html`<tr><td>${e.name}</td><td class="num">${fmt(e.amount)}</td></tr>`)}<tr class="total"><td>Gross</td><td class="num">${fmt(preview.earned_gross)}</td></tr></tbody></table>
        <table><tbody><${DeductionRows} r=${preview} /><tr class="total"><td>Net</td><td class="num">${fmt(preview.net)}</td></tr>
          <${EmployerRows} r=${preview} /></tbody></table>
      </div>`}
      ${!preview.error && preview.earnings.reduce((a, e) => a + e.amount, 0) !== sample && html`<div class="notice" style="margin-top:10px">Earnings add up to ₹${fmt(preview.earnings.reduce((a, e) => a + e.amount, 0))}, not ₹${fmt(sample)}. Add a "Balance of gross" component to absorb the difference.</div>`}
    </div>
    ${!ro && html`<div class="row"><button class="danger" onClick=${del}>Delete structure</button><span class="spacer" /><button class="primary" disabled=${busy} onClick=${save}>Save structure</button></div>`}
  </div>`;
}
