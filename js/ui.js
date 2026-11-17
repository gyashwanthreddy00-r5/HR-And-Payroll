import { html, useState, useEffect, useCallback } from './lib.js';
import { toast } from './util.js';

/** Load data asynchronously; returns {data, error, loading, reload}. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    Promise.resolve().then(fn)
      .then(data => alive && setState({ data, error: null, loading: false }))
      .catch(error => { console.error(error); alive && setState({ data: null, error, loading: false }); });
    return () => { alive = false; };
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

/** Wrap an async action: shows errors as toasts, tracks busy state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const act = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(e.message || String(e), 'err'); }
    finally { setBusy(false); }
  };
  return [busy, act];
}

export const Loading = ({ text = 'Loading…' }) => html`<div class="loading">${text}</div>`;
export const ErrorBox = ({ error }) => html`<div class="notice bad">${error?.message || String(error)}</div>`;

export function Async({ state, children }) {
  if (state.error) return html`<${ErrorBox} error=${state.error} />`;
  if (state.loading && !state.data) return html`<${Loading} />`;
  return children(state.data);
}

export function Field({ label, hint, children }) {
  return html`<label class="field"><span>${label}</span>${children}${hint && html`<span class="small muted">${hint}</span>`}</label>`;
}

/** Controlled input bound to obj[key]. */
export function Input({ label, obj, k, set, type = 'text', hint, ...rest }) {
  const v = obj[k] ?? '';
  return html`<${Field} label=${label} hint=${hint}>
    <input type=${type} value=${v} ...${rest}
      onInput=${e => set({ ...obj, [k]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value })} />
  <//>`;
}

export function Select({ label, obj, k, set, options, hint, ...rest }) {
  return html`<${Field} label=${label} hint=${hint}>
    <select value=${obj[k] ?? ''} onChange=${e => set({ ...obj, [k]: e.target.value })} ...${rest}>
      ${options.map(o => Array.isArray(o)
        ? html`<option value=${o[0]}>${o[1]}</option>`
        : html`<option value=${o}>${o}</option>`)}
    </select>
  <//>`;
}

export function Check({ label, obj, k, set }) {
  return html`<label class="check"><input type="checkbox" checked=${!!obj[k]} onChange=${e => set({ ...obj, [k]: e.target.checked })} /> ${label}</label>`;
}

export function Modal({ title, onClose, wide, children }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, []);
  return html`<div class="modal-bg" onMouseDown=${e => e.target === e.currentTarget && onClose()}>
    <div class=${'modal' + (wide ? ' wide' : '')}>
      <div class="row between" style="margin-bottom:14px"><h3 style="margin:0">${title}</h3><button class="link" onClick=${onClose}>Close</button></div>
      ${children}
    </div>
  </div>`;
}

export const Badge = ({ kind = '', children }) => html`<span class=${'badge ' + kind}>${children}</span>`;

export const INDIAN_STATES = ['Andhra Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Meghalaya','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Other / outside India'];

const EYE = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>';

/** Password field with a show/hide eye toggle. Extra props go to the <input>; `style` goes to the wrapper. */
export function PasswordInput({ style, disabled, ...props }) {
  const [show, setShow] = useState(false);
  const label = show ? 'Hide password' : 'Show password';
  return html`<div class=${'ibox pw-box' + (disabled ? ' disabled' : '')} style=${style}>
    <input ...${props} disabled=${disabled} type=${show ? 'text' : 'password'} />
    <button type="button" class="eye" disabled=${disabled} onClick=${() => setShow(s => !s)} title=${label} aria-label=${label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: show ? EYE_OFF : EYE }}></svg></button>
  </div>`;
}
