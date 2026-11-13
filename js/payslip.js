// Payslip PDF from a frozen payroll item (never from live salary data).
import { loadJsPDF } from './lib.js';
import { MONTHS, amountInWords, fmtDate } from './util.js';

const num = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const logoCache = new Map();

async function logoDataUrl(url) {
  if (!url) return null;
  if (logoCache.has(url)) return logoCache.get(url);
  const p = fetch(url).then(r => r.ok ? r.blob() : null).then(b => b && new Promise(res => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b);
  })).catch(() => null);
  logoCache.set(url, p);
  return p;
}

export function payslipPassword(company, emp) {
  const mode = company.payslip_template?.password || 'none';
  if (mode === 'dob' && emp.dob) { const [y, m, d] = emp.dob.split('-'); return `${d}${m}${y}`; }
  if (mode === 'pan' && emp.pan) return emp.pan.toUpperCase();
  return null;
}

export async function generatePayslipPdf(company, item, run) {
  const jsPDF = await loadJsPDF();
  const emp = item.employee_json || {};
  const pw = payslipPassword(company, emp);
  const doc = new jsPDF(pw ? { unit: 'pt', format: 'a4', encryption: { userPassword: pw, ownerPassword: pw + '#owner', userPermissions: ['print'] } } : { unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = 44;

  const logo = await logoDataUrl(company.logo_url);
  if (logo) { try { doc.addImage(logo, M, y - 6, 80, 36, undefined, 'FAST'); } catch { /* ignore bad image */ } }
  const tx = logo ? M + 92 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(company.name, tx, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  const addr = doc.splitTextToSize(company.address || '', W - tx - M - 150);
  doc.text(addr, tx, y + 20);
  doc.setFontSize(11); doc.setTextColor(30); doc.setFont('helvetica', 'bold');
  doc.text(`Payslip for ${MONTHS[run.month - 1]} ${run.year}`, W - M, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110);
  const ids = [company.pan && `PAN ${company.pan}`, company.pf_no && `PF ${company.pf_no}`, company.esi_no && `ESI ${company.esi_no}`].filter(Boolean).join('   ');
  doc.text(ids, W - M, y + 20, { align: 'right' });
  y += 34 + Math.max(0, addr.length - 1) * 10;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 18;

  // employee details
  const kv = [
    ['Employee', emp.name], ['Employee ID', emp.emp_code],
    ['Designation', emp.designation || '-'], ['Department', emp.department || '-'],
    ['Date of joining', emp.doj ? fmtDate(emp.doj) : '-'], ['PAN', emp.pan || '-'],
    ['UAN', emp.uan || '-'], ['ESI No.', emp.esi_no || '-'],
    ['Bank', [emp.bank_name, emp.bank_acct && `A/c ${emp.bank_acct}`].filter(Boolean).join(' · ') || '-'], ['IFSC', emp.ifsc || '-'],
    ['Days in month', num(item.days_in_month)], ['Paid days', num(item.paid_days)],
    ['LOP days', num(item.lop_days)], ['', ''],
  ];
  doc.setFontSize(9);
  const colW = (W - 2 * M) / 2;
  for (let i = 0; i < kv.length; i += 2) {
    for (let j = 0; j < 2; j++) {
      const [k, v] = kv[i + j] || ['', ''];
      if (!k) continue;
      const x = M + j * colW;
      doc.setTextColor(110); doc.text(k, x, y);
      doc.setTextColor(30); doc.text(String(v), x + 90, y);
    }
    y += 15;
  }
  y += 8;

  // earnings | deductions table
  const earnings = item.earnings_json || [];
  // Only amounts actually deducted from pay; employer contributions are not printed on the payslip.
  const deductions = item.deductions_json || [];
  const rows = Math.max(earnings.length, deductions.length);
  const half = (W - 2 * M) / 2;
  doc.setFillColor(245, 244, 240); doc.rect(M, y - 12, W - 2 * M, 20, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(60);
  doc.text('EARNINGS', M + 8, y + 1); doc.text('AMOUNT (Rs.)', M + half - 8, y + 1, { align: 'right' });
  doc.text('DEDUCTIONS', M + half + 8, y + 1); doc.text('AMOUNT (Rs.)', W - M - 8, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
  y += 22;
  for (let i = 0; i < rows; i++) {
    const e = earnings[i], d = deductions[i];
    if (e) { doc.text(e.name, M + 8, y); doc.text(num(e.amount), M + half - 8, y, { align: 'right' }); }
    if (d) { doc.text(d.name, M + half + 8, y); doc.text(num(d.amount), W - M - 8, y, { align: 'right' }); }
    y += 16;
  }
  doc.setDrawColor(220); doc.line(M, y - 8, W - M, y - 8);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Total earnings', M + 8, y); doc.text(num(item.earned_gross), M + half - 8, y, { align: 'right' });
  doc.text('Total deductions', M + half + 8, y); doc.text(num(item.total_deductions), W - M - 8, y, { align: 'right' });
  doc.line(M + half, y - 12 - rows * 16 - 28, M + half, y + 6);
  doc.rect(M, y - 12 - rows * 16 - 28 - 10, W - 2 * M, rows * 16 + 56);
  y += 34;

  doc.setFontSize(12);
  doc.text(`Net pay: Rs. ${num(item.net)}`, M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`(Rupees ${amountInWords(item.net)} only)`, M, y + 14);
  if (Number(item.lop_amount) > 0) doc.text(`Monthly gross Rs. ${num(item.gross)}, less loss of pay Rs. ${num(item.lop_amount)} for ${num(item.lop_days)} day(s).`, M, y + 28);

  // Only when the company makes the employee bear Employer EPF/EPS is it a real deduction; explain that line.
  const recovered = deductions.filter(d => d.statutory_key === 'er_pf').reduce((s, d) => s + Number(d.amount), 0);
  if (recovered > 0) {
    doc.setFontSize(8.5); doc.setTextColor(110);
    const lines = doc.splitTextToSize(`Employer EPF and EPS (Rs. ${num(recovered)}) are borne by the employee as per company policy, deducted separately from the employee's own PF.`, W - 2 * M);
    doc.text(lines, M, y + 42);
  }

  doc.setFontSize(8); doc.setTextColor(140);
  doc.text(company.payslip_template?.footer || 'This is a computer-generated payslip.', W / 2, doc.internal.pageSize.getHeight() - 30, { align: 'center' });

  const filename = `Payslip-${emp.emp_code}-${run.year}-${String(run.month).padStart(2, '0')}.pdf`;
  return { blob: doc.output('blob'), filename, password: pw };
}
