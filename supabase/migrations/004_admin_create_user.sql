-- =====================================================================
-- 004: accounts are created by an admin in Settings -> Users & roles
-- (public "Create an account" was removed from the sign-in page).
--
-- admin_create_company_user: callable only by an admin of p_company.
--  * If no login exists for the email, creates one (email already confirmed,
--    password set) the same way Supabase Auth does, so it works straight away.
--  * If a login already exists, it is just added to the company with the role
--    (its password is NOT changed).
-- Run this once in Supabase -> SQL Editor.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_create_company_user(
  p_company uuid, p_email text, p_password text, p_role text
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
begin
  if not public.has_role(p_company, array['admin']) then
    raise exception 'Only admins can create users';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_role not in ('admin', 'hr', 'accountant', 'employee') then
    raise exception 'Choose a role';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid = auth.uid() then
    raise exception 'That is your own login. Enter the HR person''s email instead.';
  end if;

  if v_uid is null then
    if length(coalesce(p_password, '')) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false,
      '', '', '', '', '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now());
  end if;

  insert into company_users(company_id, user_id, email, role) values (p_company, v_uid, v_email, p_role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  if p_role = 'employee' then
    update employees set user_id = v_uid
    where company_id = p_company and lower(email) = v_email and user_id is null;
  end if;

  return v_uid;
end $$;

revoke all on function public.admin_create_company_user(uuid, text, text, text) from public, anon;
grant execute on function public.admin_create_company_user(uuid, text, text, text) to authenticated;
