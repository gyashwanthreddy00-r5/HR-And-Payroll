# Payroll Generator (v1)

Multi-company payroll: company setup → employees → salary structures → leaves/LOP → run payroll → payslips → reports.
Built from `HRPayroll.art` (product plan + screens 1–7).

## Run locally

```
python serve.py
```
Open http://localhost:3000 (port 3000 matches the Supabase Auth site URL, so email-confirmation links land back here).

No build step: plain ES modules + Preact/htm, supabase-js, SheetJS, jsPDF and JSZip loaded from CDNs.
Any static host works for deployment (add the new URL in Supabase → Authentication → URL configuration).

Engine unit tests: http://localhost:3000/tests/engine.test.html

## Backend (Supabase project `mqglwegfbwhnbdttpucr`)

Schema: `supabase/migrations/001_schema.sql` (already applied). Every table carries `company_id`; Row Level Security
limits each user to companies they belong to, by role:

| role       | can |
|------------|-----|
| admin      | everything, settings, users, unlock payroll |
| hr         | employees, salaries, leaves, run payroll |
| accountant | view all, run & lock payroll, reports |
| employee   | own payslips from locked runs only |

`create_company()` seeds Basic/HRA/Special/PF/ESI/PT/TDS components, Staff/Interns structures, leave types and Telangana PT slabs.
Locked runs are frozen by a trigger; payroll items store a copy of every computed line, so later salary revisions never change old payslips.

## Demo data

`supabase/seed_demo.sql` creates **Acme Infotech Pvt Ltd** for an existing user (replace `:uid`): 12 employees, 3 structures,
holidays, salary revision effective 1 Nov 2026, and Sep–Nov 2026 leaves. Locked Sep and Oct 2026 payroll runs were generated
with `js/engine.js`. November is left un-run so you can try the one-click flow. Delete the company in SQL to remove it all
(everything cascades from `companies`).

## Employer PF

Settings → Pay rules → **Employer Provident Fund** (migration `002_employer_pf.sql`). Calculated on eligible PF wages
(earned Basic) for employees whose structure includes PF; never deducted from net pay; stored per payslip in
`payroll_items.employer_json` and shown on payslips, the payroll register (cost to company) and Reports → Employer cost / PF (ECR).

| Contribution type | Employer lines |
|---|---|
| EPF  | whole employer share to EPF |
| EPS  | EPS 8.33% of wages up to ₹15,000 (eligible members under 58) + EPF balance (3.67%) |
| EDLI (default) | EPS/EPF split + EDLI 0.5% (wages up to ₹15,000) + EPF admin 0.5% |

**EPF contribution paid by** (`er_pf_paid_by`, migration 003). Employer PF is calculated once either way:
- *Company (Employer)*, the default: the EPF + EPS share is a company expense under Employer Contributions; net pay unchanged.
- *Employee*: the same EPF + EPS amount becomes one deduction, "Employer PF share (borne by employee)" (`statutory_key: 'er_pf'`),
  reducing net pay. It stays in `employer_json` (marked `borne_by: 'employee'`) for the PF/ECR remittance, but is excluded
  from company cost. EDLI and admin charges always stay with the company. The employee's own PF deduction is unaffected.

**Employer EPF on payslips** is listed under *Deductions*, on its own line next to (never merged with) Employee PF.
Its effect follows "EPF contribution paid by": paid by employee → real deduction lines `ER_EPF_EE` / `ER_EPS_EE` reducing net;
paid by company → an informational row marked † (`deductionRows()` in `js/pages/employer.js`) that is excluded from
"Total deducted from pay" and from net pay. EPS, EDLI and admin charges stay under Employer Contributions.

The EPFO's monthly minimum admin charge (₹500 per establishment) is not applied. Per-employee EPS membership: Employee → Statutory.

## Code map

- `js/engine.js` – pure `calculatePayroll()` (LOP basis: calendar / fixed 30 / working days; PF, ESI, PT, TDS, one-time items)
- `js/data.js` – queries + per-month payroll context
- `js/payslip.js` – PDF payslip (optional password: DOB or PAN)
- `js/pages/*` – screens: setup, dashboard, employees (+Excel import, salary tab), structures, leaves (calendar, grid, attendance upload), payroll, payslips, reports, settings, employee portal

## Not in v1

- **Bulk email** needs an SMTP/SES provider (e.g. a Supabase Edge Function using Resend). For now, Payslips → "Mailing list (CSV)".
- **TDS projection**: TDS is entered manually per employee in the payroll register (as the plan specifies for v1).
