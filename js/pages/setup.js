import { html, useState, sb, q } from '../lib.js';
import { useAction } from '../ui.js';
import { navigate } from '../util.js';
import { PayRulesForm, ComponentsEditor, LeaveTypesEditor, ProfileForm, StatutoryForm,
  PAY_RULE_KEYS, PROFILE_KEYS, STATUTORY_KEYS, pick, payRuleErrors } from './editors.js';

const STEPS = ['Company profile', 'Statutory IDs', 'Pay rules', 'Salary components', 'Leave types'];

/** Screen 1 — short wizard on first sign-up. Every step can be skipped. */
export function Setup({ ctx }) {
  const [step, setStep] = useState(Math.min(Math.max(ctx.company.setup_step, 1), 5));
  const [c, setC] = useState({ ...ctx.company });
  const [busy, act] = useAction();

  const keysFor = s => s === 1 ? PROFILE_KEYS : s === 2 ? STATUTORY_KEYS : s === 3 ? PAY_RULE_KEYS : [];
  const go = async (next, save = true) => act(async () => {
    if (save && step === 3) { const errs = Object.values(payRuleErrors(c)); if (errs.length) throw new Error(errs[0]); }
    const patch = save ? pick(c, keysFor(step)) : {};
    const newStep = Math.max(ctx.company.setup_step, next);
    await q(sb.from('companies').update({ ...patch, setup_step: newStep }).eq('id', ctx.company.id));
    await ctx.reload();
    if (next > 5) navigate('/dashboard'); else setStep(next);
  });

  return html`<div class="stack" style="max-width:900px;margin:0 auto">
    <div>
      <div class="small muted">Set up ${ctx.company.name}</div>
      <h1>Company setup</h1>
      <p class="muted" style="margin-top:-6px">A short wizard. Each step can be skipped and changed later in Settings.</p>
    </div>
    <div class="card">
      <div class="steps">${STEPS.map((s, i) => html`<button class=${step === i + 1 ? 'active' : (ctx.company.setup_step > i + 1 ? 'done' : '')} onClick=${() => setStep(i + 1)}>${i + 1} ${s}</button>`)}</div>
      <h2>${STEPS[step - 1]}</h2>
      ${step === 1 && html`<${ProfileForm} c=${c} set=${setC} ctx=${ctx} />`}
      ${step === 2 && html`<${StatutoryForm} c=${c} set=${setC} />`}
      ${step === 3 && html`<${PayRulesForm} c=${c} set=${setC} />`}
      ${step === 4 && html`<div><p class="muted">Earnings and deductions every structure is built from. Defaults follow common Indian practice: Basic 50% of gross, HRA 40% of Basic, Special Allowance takes the balance.</p><${ComponentsEditor} ctx=${ctx} /></div>`}
      ${step === 5 && html`<div><p class="muted">Paid types reduce balance; unpaid types become Loss of Pay.</p><${LeaveTypesEditor} ctx=${ctx} /></div>`}
      <div class="row" style="margin-top:20px">
        <button disabled=${step === 1 || busy} onClick=${() => setStep(step - 1)}>Back</button>
        <span class="spacer" />
        <button class="link" disabled=${busy} onClick=${() => go(step + 1, false)}>Skip</button>
        <button class="primary" disabled=${busy} onClick=${() => go(step + 1)}>${step === 5 ? 'Finish setup' : 'Save and continue'}</button>
      </div>
    </div>
  </div>`;
}
