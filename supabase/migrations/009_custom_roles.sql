-- =====================================================================
-- 009: Roles & Permissions like the Universal ERP screens.
--  * company_roles: per-company role list. The 4 system roles (admin, hr,
--    accountant, employee) can be renamed / described; admins can add custom
--    roles. Every custom role has a base_role that decides what data the
--    database lets it read / write (Row Level Security is unchanged).
--  * company_users.role_key: the custom role a user has (null = their system role).
--  * company_role_pages: any role key (custom roles too) + can_edit
--    (false = that page is view-only for the role).
-- =====================================================================

create table if not exists public.company_roles (
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null check (key ~ '^[a-z][a-z0-9_]{1,29}$'),
  name        text not null check (length(trim(name)) between 2 and 50),
  description text check (length(description) <= 200),
  base_role   text not null check (base_role in ('admin', 'hr', 'accountant', 'employee')),
  is_system   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (company_id, key)
);
alter table public.company_roles enable row level security;
drop policy if exists cr_sel on public.company_roles;
create policy cr_sel on public.company_roles for select using (public.is_member(company_id));
drop policy if exists cr_write on public.company_roles;
create policy cr_write on public.company_roles for all
  using (public.has_role(company_id, array['admin'])) with check (public.has_role(company_id, array['admin']));
grant select, insert, update, delete on public.company_roles to authenticated;

alter table public.company_users add column if not exists role_key text;

alter table public.company_role_pages drop constraint if exists company_role_pages_role_check;
alter table public.company_role_pages add column if not exists can_edit boolean not null default true;

-- Give a user a role (system or custom). Sets the base role used by RLS and the role key.
create or replace function public.admin_set_user_role(p_company uuid, p_user uuid, p_role_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_base text;
begin
  if not public.has_role(p_company, array['admin']) then raise exception 'Only admins can change roles'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role'; end if;
  if p_role_key in ('admin', 'hr', 'accountant', 'employee') then
    v_base := p_role_key;
  else
    select base_role into v_base from company_roles where company_id = p_company and key = p_role_key and active;
    if v_base is null then raise exception 'Choose an active role'; end if;
  end if;
  update company_users set role = v_base,
    role_key = case when p_role_key in ('admin', 'hr', 'accountant', 'employee') then null else p_role_key end
  where company_id = p_company and user_id = p_user;
  if not found then raise exception 'User not found in this company'; end if;
end $$;

revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to authenticated;
