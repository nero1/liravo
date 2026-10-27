with ranked as(select id,row_number() over(order by updated_at desc,id desc) as position from custom_themes where is_active),
changed as(update custom_themes set is_active=false where id in(select id from ranked where position>1) returning id,name)
insert into financial_audit_log(action,correlation_id,metadata) select 'theme_activation_reconciled','migration-053',to_jsonb(changed) from changed;
create unique index custom_theme_single_active on custom_themes(is_active) where is_active;

create function apply_admin_configuration(p_actor_id uuid,p_action text,p_key text,p_payload jsonb,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; result jsonb; before_state jsonb; theme custom_themes; store affiliate_stores; season seasonal_events; store_countries text[];
begin
  if p_action is null or p_action not in ('theme_create','theme_set','store_create','store_update','season_create','season_update') or p_key is null or length(p_key) not between 8 and 200 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid configuration' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-configuration',0));
  perform 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Admin required' using errcode='P1003'; end if;
  fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_actor_id and action='admin:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting configuration intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  if p_action in ('theme_create','theme_set') then
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 80 then raise exception 'Invalid theme name' using errcode='P1004'; end if;
    if p_action='theme_create' then
      if p_payload->>'css_overrides' is null or length(p_payload->>'css_overrides')>50000 or (p_payload->>'css_overrides'<>'' and p_payload->>'css_overrides' !~ '^((:root|\.dark)\{(--(background|foreground|muted|muted-foreground|border|input|primary|primary-foreground|secondary|secondary-foreground|accent|accent-foreground|card|card-foreground|destructive|destructive-foreground|ring|radius):(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([0-9 .,%/+\-]+\)|[0-9.]+(rem|px));)+\}[[:space:]]*)+$') then raise exception 'Invalid theme CSS' using errcode='P1004'; end if;
      insert into custom_themes(name,css_overrides) values(p_payload->>'name',p_payload->>'css_overrides') returning * into theme;
    else
      if jsonb_typeof(p_payload->'is_active') is distinct from 'boolean' then raise exception 'Invalid activation' using errcode='P1004'; end if;
      select * into theme from custom_themes where name=p_payload->>'name' for update;
      if not found then raise exception 'Theme unavailable' using errcode='P1005'; end if;
      select jsonb_agg(to_jsonb(t)) into before_state from custom_themes t where is_active or id=theme.id;
      if (p_payload->>'is_active')::boolean then update custom_themes set is_active=false where is_active and id<>theme.id; end if;
      update custom_themes set is_active=(p_payload->>'is_active')::boolean where id=theme.id returning * into theme;
    end if;
    result:=to_jsonb(theme);
  elsif p_action in ('store_create','store_update') then
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 100 or length(coalesce(p_payload->>'url_template','')) not between 1 and 2000
      or p_payload->>'url_template' !~ '^https://[^[:space:]<>]+$' or jsonb_typeof(p_payload->'countries') is distinct from 'array'
      or jsonb_array_length(p_payload->'countries')>100 or exists(select 1 from jsonb_array_elements_text(p_payload->'countries') country where country !~ '^[A-Z]{2}$')
      or jsonb_typeof(p_payload->'is_active') is distinct from 'boolean' or jsonb_typeof(p_payload->'is_non_affiliate') is distinct from 'boolean'
      or p_payload->>'priority' is null or p_payload->>'priority' !~ '^-?[0-9]{1,6}$' or length(coalesce(p_payload->>'affiliate_tag',''))>200 then raise exception 'Invalid store' using errcode='P1004'; end if;
    store_countries:=array(select distinct jsonb_array_elements_text(p_payload->'countries'));
    if p_action='store_create' then
      insert into affiliate_stores(name,countries,url_template,affiliate_tag,is_active,priority,is_non_affiliate)
        values(p_payload->>'name',store_countries,p_payload->>'url_template',p_payload->>'affiliate_tag',(p_payload->>'is_active')::boolean,(p_payload->>'priority')::integer,(p_payload->>'is_non_affiliate')::boolean) returning * into store;
    else
      select * into store from affiliate_stores where id=(p_payload->>'id')::uuid for update;
      if not found then raise exception 'Store unavailable' using errcode='P1005'; end if;
      before_state:=to_jsonb(store);
      update affiliate_stores set name=p_payload->>'name',countries=store_countries,url_template=p_payload->>'url_template',affiliate_tag=p_payload->>'affiliate_tag',is_active=(p_payload->>'is_active')::boolean,priority=(p_payload->>'priority')::integer,is_non_affiliate=(p_payload->>'is_non_affiliate')::boolean where id=store.id returning * into store;
    end if;
    result:=to_jsonb(store);
  else
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 100 or length(coalesce(p_payload->>'theme',''))>500 or length(coalesce(p_payload->>'badge_name',''))>100
      or p_payload->>'start_date' is null or p_payload->>'end_date' is null or (p_payload->>'end_date')::timestamptz<=(p_payload->>'start_date')::timestamptz
      or jsonb_typeof(p_payload->'is_published') is distinct from 'boolean' then raise exception 'Invalid seasonal event' using errcode='P1004'; end if;
    if p_action='season_create' then
      insert into seasonal_events(name,theme,start_date,end_date,badge_name,is_published) values(p_payload->>'name',p_payload->>'theme',(p_payload->>'start_date')::timestamptz,(p_payload->>'end_date')::timestamptz,p_payload->>'badge_name',(p_payload->>'is_published')::boolean) returning * into season;
    else
      select * into season from seasonal_events where id=(p_payload->>'id')::uuid for update;
      if not found then raise exception 'Event unavailable' using errcode='P1005'; end if;
      before_state:=to_jsonb(season);
      update seasonal_events set name=p_payload->>'name',theme=p_payload->>'theme',start_date=(p_payload->>'start_date')::timestamptz,end_date=(p_payload->>'end_date')::timestamptz,badge_name=p_payload->>'badge_name',is_published=(p_payload->>'is_published')::boolean where id=season.id returning * into season;
    end if;
    result:=to_jsonb(season);
  end if;
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_actor_id,'admin:'||p_action,p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,action,idempotency_key,correlation_id,metadata) values(p_actor_id,'admin_'||p_action,p_key,p_correlation_id,jsonb_build_object('before',before_state,'after',result));
  return result;
end $$;
revoke all on function apply_admin_configuration(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function apply_admin_configuration(uuid,text,text,jsonb,text) to service_role;
revoke insert,update,delete on custom_themes,affiliate_stores,seasonal_events from anon,authenticated;
grant select,insert,update,delete on custom_themes,affiliate_stores,seasonal_events to service_role;
notify pgrst,'reload schema';
