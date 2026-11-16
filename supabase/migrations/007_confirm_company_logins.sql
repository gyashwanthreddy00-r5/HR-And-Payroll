-- =====================================================================
-- 007: logins added by an admin can sign in straight away.
--  * One-off: confirm every login that already belongs to a company
--    (e.g. made through the old public sign-up and never confirmed).
--  * admin_create_company_user: when the email already has a login that was
--    never confirmed, confirm it and set the password the admin entered.
--    Confirmed logins keep their own password, as before.
-- =====================================================================

update auth.users set email_confirmed_at = now()
where email_confirmed_at is null
  and id in (select user_id from public.company_users);

create or replace function public.admin_create_company_user(
  p_company uuid, p_email text, p_password text, p_role text
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
  v_confirmed boolean;
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

  select id, email_confirmed_at is not null into v_uid, v_confirmed from auth.users where lower(email) = v_email;
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
  elsif not v_confirmed then
    -- Never-confirmed login (old public sign-up): the admin's password and confirmation take over.
    if coalesce(p_password, '') <> '' and length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update auth.users set email_confirmed_at = now(), confirmation_token = '', updated_at = now(),
      encrypted_password = case when coalesce(p_password, '') <> '' then crypt(p_password, gen_salt('bf')) else encrypted_password end
    where id = v_uid;
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
