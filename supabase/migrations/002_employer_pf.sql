-- =====================================================================
-- Employer Provident Fund (Employer PF)
--   er_pf_type: which statutory heads the employer contribution covers
--     'EPF'  -> whole employer share credited to EPF (no pension split)
--     'EPS'  -> standard split: EPS 8.33% (on wages up to ₹15,000, eligible members) + EPF balance (3.67%)
--     'EDLI' -> standard split + EDLI insurance + EPF admin charges
-- Employer PF is never deducted from net pay; it is part of payroll cost.
-- =====================================================================
alter table public.companies
  add column if not exists er_pf_enabled boolean not null default true,
  add column if not exists er_pf_rate    numeric not null default 12,
  add column if not exists er_pf_cap     numeric not null default 15000,
  add column if not exists er_pf_type    text    not null default 'EDLI',
  add column if not exists er_edli_rate  numeric not null default 0.5,
  add column if not exists er_admin_rate numeric not null default 0.5;

do $$ begin
  alter table public.companies add constraint companies_er_pf_type_chk check (er_pf_type in ('EPF','EPS','EDLI'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_er_pf_values_chk check (
    er_pf_rate between 0 and 100 and er_pf_cap >= 0 and er_edli_rate between 0 and 100 and er_admin_rate between 0 and 100);
exception when duplicate_object then null; end $$;

-- EPS membership: false for members who joined after 1 Sep 2014 earning above ₹15,000,
-- international workers, etc. Members aged 58+ are excluded automatically by the engine.
alter table public.employees
  add column if not exists eps_eligible boolean not null default true;

-- Frozen employer contribution lines per payslip (informational, not part of net pay).
alter table public.payroll_items
  add column if not exists employer_json  jsonb   not null default '[]',
  add column if not exists employer_total numeric not null default 0;
