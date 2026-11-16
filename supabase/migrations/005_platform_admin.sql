-- =====================================================================
-- 005: super admin creates companies + their HR logins.
--  * platform_admins: logins allowed to create companies (the super admin).
--    Seeded with everyone who is currently an admin of a company.
--  * create_company() is no longer callable directly from the browser;
--    admin_create_company() checks the caller is a platform admin, creates the
--    company (caller becomes its admin) and, optionally, its HR login.
-- Needs 004_admin_create_user.sql. Run once in Supabase -> SQL Editor.
-- =====================================================================

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists pa_sel on public.platform_admins;
create policy pa_sel on public.platform_admins for select using (user_id = auth.uid());

insert into public.platform_admins(user_id)
select distinct user_id from public.company_users where role = 'admin'
on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function public.admin_create_company(
  p_name text, p_state text, p_hr_email text default null, p_hr_password text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the administrator can create companies';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the company name'; end if;
  cid := public.create_company(trim(p_name), p_state);
  if coalesce(trim(p_hr_email), '') <> '' then
    perform public.admin_create_company_user(cid, p_hr_email, p_hr_password, 'hr');
  end if;
  return cid;
end $$;

revoke all on function public.create_company(text, text) from public, anon, authenticated;
revoke all on function public.admin_create_company(text, text, text, text) from public, anon;
grant execute on function public.admin_create_company(text, text, text, text) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
