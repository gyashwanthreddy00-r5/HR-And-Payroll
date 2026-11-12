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
