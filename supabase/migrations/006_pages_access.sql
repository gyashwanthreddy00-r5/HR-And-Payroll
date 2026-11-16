-- =====================================================================
-- 006: Pages Management + Role-Page Assignment (per company).
--  * company_pages:      admin renames / reorders / switches off menu pages.
--  * company_role_pages: which pages the HR and Accountant roles can open.
--    A missing row means the default (allowed). Admin always sees every page;
--    employees only have "My payslips".
-- Menu visibility only: what data each role may read/write is still enforced
-- by Row Level Security (see 001_schema.sql).
-- Run once in Supabase -> SQL Editor.
-- =====================================================================

create table if not exists public.company_pages (
  company_id uuid not null references public.companies(id) on delete cascade,
  page_key   text not null,
  label      text not null check (length(trim(label)) between 2 and 40),
  sort_order int  not null default 0,
  active     boolean not null default true,
  primary key (company_id, page_key)
);

create table if not exists public.company_role_pages (
  company_id uuid not null references public.companies(id) on delete cascade,
  role       text not null check (role in ('hr', 'accountant')),
  page_key   text not null,
  can_view   boolean not null,
  primary key (company_id, role, page_key)
);

alter table public.company_pages      enable row level security;
alter table public.company_role_pages enable row level security;

drop policy if exists cp_sel on public.company_pages;
create policy cp_sel on public.company_pages for select using (public.is_member(company_id));
drop policy if exists cp_write on public.company_pages;
create policy cp_write on public.company_pages for all
  using (public.has_role(company_id, array['admin'])) with check (public.has_role(company_id, array['admin']));

drop policy if exists crp_sel on public.company_role_pages;
create policy crp_sel on public.company_role_pages for select using (public.is_member(company_id));
drop policy if exists crp_write on public.company_role_pages;
create policy crp_write on public.company_role_pages for all
  using (public.has_role(company_id, array['admin'])) with check (public.has_role(company_id, array['admin']));

grant select, insert, update, delete on public.company_pages, public.company_role_pages to authenticated;
