// Third-party modules (loaded from CDN, no build step).
export {
  html, render, useState, useEffect, useMemo, useCallback, useRef,
} from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Await a supabase query and throw on error. */
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

// Heavy libraries are loaded only when needed.
export const loadXLSX = () => import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
export const loadJsPDF = () => import('https://esm.sh/jspdf@2.5.1').then(m => m.jsPDF || m.default.jsPDF || m.default);
export const loadJSZip = () => import('https://esm.sh/jszip@3.10.1').then(m => m.default);
