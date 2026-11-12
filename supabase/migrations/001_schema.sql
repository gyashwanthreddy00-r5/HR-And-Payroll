-- =====================================================================
-- Payroll Generator · v1 schema
-- Every business table carries company_id; Row Level Security scopes
-- all access to companies the signed-in user belongs to.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- core tenancy ----------------------------------------------
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  logo_url        text,
  address         text,
  state           text default 'Telangana',
  pan             text,
  tan             text,
  pf_no           text,
  esi_no          text,
  pay_cycle       text not null default 'Monthly, paid on last working day',
  lop_basis       text not null default 'calendar' check (lop_basis in ('calendar','fixed30','working')),
  weekly_offs     int[] not null default '{0,6}',          -- 0=Sun … 6=Sat
  pf_enabled      boolean not null default true,
  pf_rate         numeric not null default 12,
  pf_cap          numeric not null default 15000,
  esi_enabled     boolean not null default true,
  esi_rate        numeric not null default 0.75,
  esi_limit       numeric not null default 21000,
  pt_enabled      boolean not null default true,
  tds_mode        text not null default 'manual',
  emp_code_prefix text not null default 'EMP-',
  currency        text not null default 'INR',
  payslip_template jsonb not null default '{"password":"none","footer":"This is a computer-generated payslip and does not require a signature."}',
  setup_step      int not null default 1,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.company_users (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,
  role       text not null check (role in ('admin','hr','accountant','employee')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- ---------- people -----------------------------------------------------
create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,   -- self-service login
  emp_code    text not null,
  name        text not null,
  email       text,
  phone       text,
  gender      text,
  dob         date,
  doj         date,
  exit_date   date,
  department  text,
  designation text,
  address     text,
  pan         text,
  uan         text,
  esi_no      text,
  bank_name   text,
  bank_acct   text,
  ifsc        text,
  status      text not null default 'active' check (status in ('active','inactive')),
  custom      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (company_id, emp_code)
);

-- ---------- salary engine ----------------------------------------------
create table if not exists public.salary_components (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  code          text not null,
  type          text not null check (type in ('earning','deduction')),
  calc_type     text not null check (calc_type in ('fixed','pct_basic','pct_gross','pct_ctc','balance','formula','statutory')),
  value         numeric not null default 0,
  formula       text,
  taxable       boolean not null default true,
  statutory_key text check (statutory_key in ('basic','pf','esi','pt','tds')),
  sort_order    int not null default 0,
  active        boolean not null default true,
  unique (company_id, code)
);

create table if not exists public.salary_structures (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text,
  unique (company_id, name)
);

create table if not exists public.structure_components (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  structure_id uuid not null references public.salary_structures(id) on delete cascade,
  component_id uuid not null references public.salary_components(id) on delete cascade,
  sort_order   int not null default 0,
  calc_type    text,        -- optional override of the component's rule
  value        numeric,
  formula      text,
  unique (structure_id, component_id)
);

create table if not exists public.employee_salaries (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  structure_id   uuid not null references public.salary_structures(id),
  annual_ctc     numeric not null,
  monthly_gross  numeric not null,
  effective_from date not null,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

-- ---------- leaves & calendar ------------------------------------------
create table if not exists public.leave_types (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  code          text not null,
  paid          boolean not null default true,
  annual_quota  numeric not null default 0,
  carry_forward boolean not null default false,
  unique (company_id, code)
);

create table if not exists public.leave_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  date          date not null,
  kind          text not null default 'leave' check (kind in ('leave','absent')),
  leave_type_id uuid references public.leave_types(id) on delete set null,
  half_day      boolean not null default false,
  status        text not null default 'approved' check (status in ('approved','pending','rejected')),
  note          text,
  created_at    timestamptz not null default now(),
  unique (employee_id, date)
);

create table if not exists public.holidays (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date       date not null,
  name       text not null,
  unique (company_id, date)
);

create table if not exists public.pt_slabs (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  min_gross  numeric not null,
  max_gross  numeric,              -- null = no upper bound
  amount     numeric not null
);

-- ---------- payroll ----------------------------------------------------
create table if not exists public.payroll_runs (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year       int not null,
  month      int not null check (month between 1 and 12),
  status     text not null default 'draft' check (status in ('draft','processed','locked')),
  totals     jsonb not null default '{}',
  run_by     uuid references auth.users(id),
  run_at     timestamptz,
  locked_by  uuid references auth.users(id),
  locked_at  timestamptz,
  unique (company_id, year, month)
);

create table if not exists public.payroll_items (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  run_id           uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  employee_json    jsonb not null default '{}',   -- frozen copy of employee details
  days_in_month    numeric not null,
  paid_days        numeric not null,
  lop_days         numeric not null,
  earnings_json    jsonb not null default '[]',
  deductions_json  jsonb not null default '[]',
  adjustments_json jsonb not null default '{"additions":[],"deductions":[],"tds":0}',
  gross            numeric not null,             -- full monthly gross
  earned_gross     numeric not null,
  lop_amount       numeric not null,
  total_deductions numeric not null,
  net              numeric not null,
  unique (run_id, employee_id)
);

create table if not exists public.payslips (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  payroll_item_id uuid not null unique references public.payroll_items(id) on delete cascade,
  pdf_path        text,
  generated_at    timestamptz not null default now(),
  emailed_at      timestamptz
);

create index if not exists employees_company_idx     on public.employees(company_id);
create index if not exists leave_entries_emp_date    on public.leave_entries(employee_id, date);
create index if not exists emp_sal_emp_eff           on public.employee_salaries(employee_id, effective_from desc);
create index if not exists payroll_items_run_idx     on public.payroll_items(run_id);

-- =====================================================================
-- Access helpers (SECURITY DEFINER so policies don't recurse)
-- =====================================================================
create or replace function public.has_role(cid uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_users
                 where company_id = cid and user_id = auth.uid() and role = any(roles));
$$;

create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_users where company_id = cid and user_id = auth.uid());
$$;

create or replace function public.my_employee_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from employees where user_id = auth.uid();
$$;

-- =====================================================================
-- Row Level Security
-- staff = admin, hr, accountant (see everything in the company)
-- writers = admin, hr (edit people, salaries, leaves)
-- payroll = admin, hr, accountant (run / lock payroll)
-- employee = only their own employee row, salary, leaves and payslips
-- =====================================================================
alter table public.companies          enable row level security;
alter table public.company_users      enable row level security;
alter table public.employees          enable row level security;
alter table public.salary_components  enable row level security;
alter table public.salary_structures  enable row level security;
alter table public.structure_components enable row level security;
alter table public.employee_salaries  enable row level security;
alter table public.leave_types        enable row level security;
alter table public.leave_entries      enable row level security;
alter table public.holidays           enable row level security;
alter table public.pt_slabs           enable row level security;
alter table public.payroll_runs       enable row level security;
alter table public.payroll_items      enable row level security;
alter table public.payslips           enable row level security;

-- companies
drop policy if exists companies_sel on public.companies;
create policy companies_sel on public.companies for select using (public.is_member(id));
drop policy if exists companies_upd on public.companies;
create policy companies_upd on public.companies for update using (public.has_role(id, array['admin']));
drop policy if exists companies_del on public.companies;
create policy companies_del on public.companies for delete using (public.has_role(id, array['admin']));
-- (insert goes through create_company())

-- company_users
drop policy if exists cu_sel on public.company_users;
create policy cu_sel on public.company_users for select
  using (user_id = auth.uid() or public.has_role(company_id, array['admin','hr','accountant']));
drop policy if exists cu_write on public.company_users;
create policy cu_write on public.company_users for all
  using (public.has_role(company_id, array['admin'])) with check (public.has_role(company_id, array['admin']));

-- generic macro for company-config tables: members read, admin/hr write
do $$
declare t text;
begin
  foreach t in array array['salary_components','salary_structures','structure_components',
                           'leave_types','holidays','pt_slabs']
  loop
    execute format('drop policy if exists %1$s_sel on public.%1$s', t);
    execute format('create policy %1$s_sel on public.%1$s for select using (public.is_member(company_id))', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.has_role(company_id, array[''admin'',''hr''])) with check (public.has_role(company_id, array[''admin'',''hr'']))', t);
  end loop;
end $$;

-- employee-scoped tables: staff read all, employees read own; admin/hr write
drop policy if exists employees_sel on public.employees;
create policy employees_sel on public.employees for select
  using (public.has_role(company_id, array['admin','hr','accountant']) or user_id = auth.uid());
drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all
  using (public.has_role(company_id, array['admin','hr'])) with check (public.has_role(company_id, array['admin','hr']));

drop policy if exists emp_sal_sel on public.employee_salaries;
create policy emp_sal_sel on public.employee_salaries for select
  using (public.has_role(company_id, array['admin','hr','accountant']) or employee_id in (select public.my_employee_ids()));
drop policy if exists emp_sal_write on public.employee_salaries;
create policy emp_sal_write on public.employee_salaries for all
  using (public.has_role(company_id, array['admin','hr'])) with check (public.has_role(company_id, array['admin','hr']));

drop policy if exists leaves_sel on public.leave_entries;
create policy leaves_sel on public.leave_entries for select
  using (public.has_role(company_id, array['admin','hr','accountant']) or employee_id in (select public.my_employee_ids()));
drop policy if exists leaves_write on public.leave_entries;
create policy leaves_write on public.leave_entries for all
  using (public.has_role(company_id, array['admin','hr'])) with check (public.has_role(company_id, array['admin','hr']));

-- payroll
drop policy if exists runs_sel on public.payroll_runs;
create policy runs_sel on public.payroll_runs for select using (public.is_member(company_id));
drop policy if exists runs_write on public.payroll_runs;
create policy runs_write on public.payroll_runs for all
  using (public.has_role(company_id, array['admin','hr','accountant']))
  with check (public.has_role(company_id, array['admin','hr','accountant']));

drop policy if exists items_sel on public.payroll_items;
create policy items_sel on public.payroll_items for select
  using (public.has_role(company_id, array['admin','hr','accountant'])
         or (employee_id in (select public.my_employee_ids())
             and exists (select 1 from payroll_runs r where r.id = run_id and r.status = 'locked')));
drop policy if exists items_write on public.payroll_items;
create policy items_write on public.payroll_items for all
  using (public.has_role(company_id, array['admin','hr','accountant']))
  with check (public.has_role(company_id, array['admin','hr','accountant']));

drop policy if exists payslips_sel on public.payslips;
create policy payslips_sel on public.payslips for select
  using (public.has_role(company_id, array['admin','hr','accountant'])
         or payroll_item_id in (select id from payroll_items where employee_id in (select public.my_employee_ids())));
drop policy if exists payslips_write on public.payslips;
create policy payslips_write on public.payslips for all
  using (public.has_role(company_id, array['admin','hr','accountant']))
  with check (public.has_role(company_id, array['admin','hr','accountant']));

-- =====================================================================
-- Locked runs are frozen: no edits to the run's items once locked.
-- Only an admin may unlock.
-- =====================================================================
create or replace function public.guard_locked_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from payroll_runs where id = coalesce(new.run_id, old.run_id);
  if st = 'locked' then
    raise exception 'Payroll run is locked; unlock it before editing.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_locked_items on public.payroll_items;
create trigger trg_guard_locked_items before insert or update or delete on public.payroll_items
  for each row execute function public.guard_locked_items();

create or replace function public.guard_unlock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'locked' and new.status <> 'locked' and not public.has_role(old.company_id, array['admin']) then
    raise exception 'Only an admin can unlock a payroll run.';
  end if;
  if old.status = 'locked' and tg_op = 'DELETE' then
    raise exception 'Locked payroll runs cannot be deleted.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_unlock on public.payroll_runs;
create trigger trg_guard_unlock before update or delete on public.payroll_runs
  for each row execute function public.guard_unlock();

-- =====================================================================
-- RPCs
-- =====================================================================

-- Create a company, make the caller its admin and seed sensible defaults.
create or replace function public.create_company(p_name text, p_state text default 'Telangana')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid; s_staff uuid; s_intern uuid;
  c_basic uuid; c_hra uuid; c_special uuid; c_pf uuid; c_esi uuid; c_pt uuid; c_tds uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  insert into companies(name, state, created_by,
                        emp_code_prefix)
  values (p_name, coalesce(p_state,'Telangana'), auth.uid(),
          upper(left(regexp_replace(p_name, '[^A-Za-z]', '', 'g'), 3)) || '-')
  returning id into cid;

  insert into company_users(company_id, user_id, email, role)
  values (cid, auth.uid(), (select email from auth.users where id = auth.uid()), 'admin');

  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'Basic','BASIC','earning','pct_gross',50,true,'basic',1) returning id into c_basic;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'House Rent Allowance','HRA','earning','pct_basic',40,true,null,2) returning id into c_hra;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'Special Allowance','SPECIAL','earning','balance',0,true,null,99) returning id into c_special;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'PF (employee)','PF','deduction','statutory',0,false,'pf',101) returning id into c_pf;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'ESI (employee)','ESI','deduction','statutory',0,false,'esi',102) returning id into c_esi;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'Professional Tax','PT','deduction','statutory',0,false,'pt',103) returning id into c_pt;
  insert into salary_components(company_id,name,code,type,calc_type,value,taxable,statutory_key,sort_order) values
    (cid,'TDS','TDS','deduction','statutory',0,false,'tds',104) returning id into c_tds;

  insert into salary_structures(company_id,name,description) values (cid,'Staff','Default structure for permanent staff') returning id into s_staff;
  insert into salary_structures(company_id,name,description) values (cid,'Interns','Stipend only, no PF') returning id into s_intern;

  insert into structure_components(company_id,structure_id,component_id,sort_order) values
    (cid,s_staff,c_basic,1),(cid,s_staff,c_hra,2),(cid,s_staff,c_special,3),
    (cid,s_staff,c_pf,4),(cid,s_staff,c_esi,5),(cid,s_staff,c_pt,6),(cid,s_staff,c_tds,7),
    (cid,s_intern,c_basic,1),(cid,s_intern,c_special,2),(cid,s_intern,c_pt,3);

  insert into leave_types(company_id,name,code,paid,annual_quota,carry_forward) values
    (cid,'Casual leave','CL',true,12,false),
    (cid,'Sick leave','SL',true,6,false),
    (cid,'Earned leave','EL',true,15,true),
    (cid,'Unpaid leave','LOP',false,0,false);

  -- Telangana PT slabs (editable in Settings)
  insert into pt_slabs(company_id,min_gross,max_gross,amount) values
    (cid,0,15000,0),(cid,15000.01,20000,150),(cid,20000.01,null,200);

  return cid;
end $$;

-- Add an existing (signed-up) user to a company by email.
create or replace function public.add_company_user(p_company uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.has_role(p_company, array['admin']) then raise exception 'Only admins can add users'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'No account with email %. Ask them to sign up first.', p_email; end if;
  insert into company_users(company_id,user_id,email,role) values (p_company, uid, lower(p_email), p_role)
  on conflict (company_id,user_id) do update set role = excluded.role;
  if p_role = 'employee' then
    update employees set user_id = uid where company_id = p_company and lower(email) = lower(p_email) and user_id is null;
  end if;
end $$;

revoke all on function public.create_company(text,text) from public, anon;
revoke all on function public.add_company_user(uuid,text,text) from public, anon;
grant execute on function public.create_company(text,text) to authenticated;
grant execute on function public.add_company_user(uuid,text,text) to authenticated;

-- =====================================================================
-- Storage: private bucket for generated payslip PDFs and logos.
-- Path convention: <company_id>/...
-- =====================================================================
insert into storage.buckets (id, name, public) values ('payslips','payslips', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('logos','logos', true)
  on conflict (id) do nothing;

drop policy if exists payslips_obj_rw on storage.objects;
create policy payslips_obj_rw on storage.objects for all to authenticated
  using (bucket_id = 'payslips' and public.has_role(((storage.foldername(name))[1])::uuid, array['admin','hr','accountant']))
  with check (bucket_id = 'payslips' and public.has_role(((storage.foldername(name))[1])::uuid, array['admin','hr','accountant']));

drop policy if exists logos_obj_write on storage.objects;
create policy logos_obj_write on storage.objects for all to authenticated
  using (bucket_id = 'logos' and public.has_role(((storage.foldername(name))[1])::uuid, array['admin']))
  with check (bucket_id = 'logos' and public.has_role(((storage.foldername(name))[1])::uuid, array['admin']));
