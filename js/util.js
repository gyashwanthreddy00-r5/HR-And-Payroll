export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
/** 60000 -> "60,000" (Indian grouping) */
export const fmt = n => (n === null || n === undefined || n === '' || isNaN(n)) ? '–' : inr.format(Number(n));
export const money = n => '₹' + fmt(n);

export const pad = n => String(n).padStart(2, '0');
export const ym = (y, m) => `${y}-${pad(m)}`;
export const monthLabel = (y, m) => `${MONTHS[m - 1]} ${y}`;
export function parseYm(s) {
  const [y, m] = String(s || '').split('-').map(Number);
  if (!y || !m) { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }
  return { year: y, month: m };
}
export function prevMonth(y, m) { return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 }; }
export function nextMonth(y, m) { return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 }; }
export const monthStart = (y, m) => `${y}-${pad(m)}-01`;
export const monthEnd = (y, m) => `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
export function fmtDate(s) {
  if (!s) return '–';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return `${pad(d)} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** Excel serial / Date / string -> 'YYYY-MM-DD' (or null). */
export function toIsoDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d = new Date(s);
  return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toCSV(rows) {
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
export const downloadCSV = (rows, name) => downloadBlob(new Blob([toCSV(rows)], { type: 'text/csv' }), name);

/** 51850 -> "Fifty One Thousand Eight Hundred Fifty" (Indian system) */
export function amountInWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = n => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  const parts = [];
  const crore = Math.floor(num / 1e7); num %= 1e7;
  const lakh = Math.floor(num / 1e5); num %= 1e5;
  const th = Math.floor(num / 1e3); num %= 1e3;
  if (crore) parts.push(amountInWords(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (th) parts.push(two(th) + ' Thousand');
  if (num) parts.push(three(num));
  return parts.join(' ');
}

export const navigate = path => { location.hash = '#' + path; };
