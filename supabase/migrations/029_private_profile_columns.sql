-- Public profile policies must never expose authentication/contact secrets.
revoke select on users from public;
do $$
declare role_name text; columns_sql text;
begin
  select string_agg(format('%I',attname),',') into columns_sql from pg_attribute
    where attrelid='public.users'::regclass and attnum>0 and not attisdropped
      and attname not in ('email','pin_hash','password_hash','totp_secret','recovery_codes','push_token','unsubscribe_token','telegram_id','google_id');
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke select on users from %I',role_name);
      execute format('grant select (%s) on users to %I',columns_sql,role_name);
    end if;
  end loop;
end $$;
grant select on users to service_role;
