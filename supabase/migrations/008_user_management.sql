-- =====================================================================
-- 008: User Management like the Universal ERP screen.
--  * company_users.full_name (display name) and .active (Active / Inactive).
--  * An inactive user keeps their login but loses all access to that company:
--    has_role() / is_member() only count active memberships.
--  * admin_update_company_user: display name, role, active, optional new password.
--  * admin_delete_company_user: removes the user from the company, and deletes the
--    login itself when it belongs to no other company.
-- Password changes are allowed only for logins that belong solely to companies
-- the caller administers (or when the caller is the super admin).
-- =====================================================================

alter table public.company_users add column if not exists full_name text;
alter table public.company_users add column if not exists active boolean not null default true;

create or replace function public.has_role(cid uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_users
                 where company_id = cid and user_id = auth.uid() and active and role = any(roles));
$$;

create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_users where company_id = cid and user_id = auth.uid() and active);
$$;

-- Can the caller manage this login's password / delete the login?
create or replace function public.can_manage_login(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or not exists (select 1 from company_users cu where cu.user_id = p_user
                     and not public.has_role(cu.company_id, array['admin']));
$$;

create or replace function public.admin_update_company_user(
  p_company uuid, p_user uuid, p_full_name text, p_role text, p_active boolean, p_password text default null
) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.has_role(p_company, array['admin']) then raise exception 'Only admins can edit users'; end if;
  if not exists (select 1 from company_users where company_id = p_company and user_id = p_user) then
    raise exception 'User not found in this company';
  end if;
  if p_role not in ('admin', 'hr', 'accountant', 'employee') then raise exception 'Choose a role'; end if;
  if length(coalesce(p_full_name, '')) > 100 then raise exception 'Display name can be at most 100 characters'; end if;
  if p_user = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'You can''t deactivate yourself or remove your own admin role';
  end if;

  update company_users set full_name = nullif(trim(p_full_name), ''), role = p_role, active = p_active
  where company_id = p_company and user_id = p_user;

  if coalesce(p_password, '') <> '' then
    if length(p_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
    if not public.can_manage_login(p_user) then
      raise exception 'This login also belongs to another company, so only the super admin can change its password';
    end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  end if;
end $$;

create or replace function public.admin_delete_company_user(p_company uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(p_company, array['admin']) then raise exception 'Only admins can delete users'; end if;
  if p_user = auth.uid() then raise exception 'You can''t delete your own login'; end if;
  delete from company_users where company_id = p_company and user_id = p_user;
  update employees set user_id = null where company_id = p_company and user_id = p_user;
  -- No other company left: remove the login too (unless it is a super admin).
  if not exists (select 1 from company_users where user_id = p_user)
     and not exists (select 1 from platform_admins where user_id = p_user) then
    delete from auth.users where id = p_user;
  end if;
end $$;

revoke all on function public.admin_update_company_user(uuid, uuid, text, text, boolean, text) from public, anon;
revoke all on function public.admin_delete_company_user(uuid, uuid) from public, anon;
revoke all on function public.can_manage_login(uuid) from public, anon;
grant execute on function public.admin_update_company_user(uuid, uuid, text, text, boolean, text) to authenticated;
grant execute on function public.admin_delete_company_user(uuid, uuid) to authenticated;
grant execute on function public.can_manage_login(uuid) to authenticated;
