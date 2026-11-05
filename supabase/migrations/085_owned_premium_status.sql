create function premium_status_snapshot(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  select jsonb_build_object('active',has_premium_access(p_user),'subscriptions',coalesce(jsonb_agg(jsonb_build_object('provider',provider,'paidUntil',current_period_end,'renewalCancelled',renewal_cancelled) order by provider,current_period_end desc nulls last,id),'[]'::jsonb)) into result
  from subscriptions where user_id=p_user and status='active' and current_period_end>now();
  return result;
end $$;
revoke all on function premium_status_snapshot(uuid) from public,anon,authenticated;
grant execute on function premium_status_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
