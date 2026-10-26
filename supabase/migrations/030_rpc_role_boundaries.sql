-- Supabase installations can have explicit default function grants in addition to PUBLIC.
do $$
declare routine record; role_name text;
begin
  for routine in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'create_payout_request_atomic','create_tip_transaction','process_payment_event','apply_social_intent',
      'award_xp_once','claim_outbox_events','process_outbox_event_atomic','create_subscription_intent',
      'cancel_subscriptions_atomic','page_followed_lists','process_subscription_webhook','toggle_review_like_atomic','increment_xp'
    ]) loop
    execute format('revoke execute on function %s from public',routine.signature);
    foreach role_name in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=role_name) then
        execute format('revoke execute on function %s from %I',routine.signature,role_name);
      end if;
    end loop;
  end loop;
end $$;
