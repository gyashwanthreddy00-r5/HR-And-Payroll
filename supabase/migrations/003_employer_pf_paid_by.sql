-- Who bears the employer's EPF + EPS share.
--   'employer' -> company expense, shown under Employer Contributions, not deducted (default)
--   'employee' -> deducted from the employee's salary as a separate deduction line
-- EDLI and EPF admin charges always remain a company expense.
-- Locked payroll items are frozen copies, so this never changes finalized payslips.
alter table public.companies
  add column if not exists er_pf_paid_by text not null default 'employer';

do $$ begin
  alter table public.companies add constraint companies_er_pf_paid_by_chk check (er_pf_paid_by in ('employer','employee'));
exception when duplicate_object then null; end $$;
