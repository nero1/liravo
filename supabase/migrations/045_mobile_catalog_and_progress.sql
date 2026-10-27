create index if not exists books_isbn10_lookup on books(isbn_10) where isbn_10 is not null;
create function store_catalog_book(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result books; identity_key text; lock_key text;
begin
  identity_key:=coalesce(nullif(p_data->>'isbn_13',''),nullif(p_data->>'google_books_id',''),nullif(p_data->>'open_library_id',''),nullif(p_data->>'isbn_10',''));
  if identity_key is null or length(coalesce(p_data->>'title','')) not between 1 and 500 or length(coalesce(p_data->>'author_name','')) not between 1 and 200 then raise exception 'Invalid catalog book' using errcode='P1004'; end if;
  for lock_key in select distinct value from jsonb_each_text(p_data) where key in ('isbn_13','isbn_10','google_books_id','open_library_id') and value<>'' order by value loop
    perform pg_advisory_xact_lock(hashtextextended('catalog-book:'||lock_key,0));
  end loop;
  select * into result from books where google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id' or isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' order by created_at,id limit 1;
  if found then return to_jsonb(result); end if;
  begin
    insert into books(google_books_id,open_library_id,isbn_10,isbn_13,title,subtitle,author_name,author_names,publisher,published_year,description,cover_url,page_count,genres,language,average_rating,ratings_count)
      values(p_data->>'google_books_id',p_data->>'open_library_id',p_data->>'isbn_10',p_data->>'isbn_13',p_data->>'title',p_data->>'subtitle',p_data->>'author_name',
        array(select jsonb_array_elements_text(coalesce(p_data->'author_names','[]'::jsonb))),p_data->>'publisher',(p_data->>'published_year')::integer,p_data->>'description',p_data->>'cover_url',(p_data->>'page_count')::integer,
        array(select jsonb_array_elements_text(coalesce(p_data->'genres','[]'::jsonb))),coalesce(p_data->>'language','en'),(p_data->>'average_rating')::numeric,coalesce((p_data->>'ratings_count')::integer,0)) returning * into result;
  exception when unique_violation then
    select * into result from books where google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id' or isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' order by created_at,id limit 1;
    if not found then raise; end if;
  end;
  return to_jsonb(result);
end $$;

insert into reading_goals(user_id,year,target_books) select id,extract(year from now() at time zone 'UTC')::integer,annual_reading_goal from users where annual_reading_goal is not null on conflict(user_id,year) do nothing;
update users u set annual_reading_goal=g.target_books from reading_goals g where g.user_id=u.id and g.year=extract(year from now() at time zone 'UTC')::integer;
create function sync_reading_goal()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    if old.year=extract(year from now() at time zone 'UTC')::integer then update users set annual_reading_goal=null where id=old.user_id; end if;
    return old;
  end if;
  if new.year=extract(year from now() at time zone 'UTC')::integer then update users set annual_reading_goal=new.target_books where id=new.user_id; end if;
  return new;
end $$;
create trigger reading_goal_profile after insert or update or delete on reading_goals for each row execute function sync_reading_goal();
create function set_reading_goal(p_user_id uuid,p_year integer,p_target integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result reading_goals;
begin
  if p_year is null or p_year not between 2020 and 2099 or p_target is null or p_target not between 1 and 10000 then raise exception 'Invalid goal' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  insert into reading_goals(user_id,year,target_books) values(p_user_id,p_year,p_target) on conflict(user_id,year) do update set target_books=excluded.target_books,updated_at=now() returning * into result;
  return to_jsonb(result);
end $$;
create function reading_goal_snapshot(p_user_id uuid,p_year integer)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with goal as(select * from reading_goals where user_id=p_user_id and year=p_year),
  completed as(select count(distinct sb.book_id)::integer as count from shelf_books sb join shelves s on s.id=sb.shelf_id
    where s.user_id=p_user_id and sb.user_id=p_user_id and s.default_type='have_read' and sb.finished_at>=make_date(p_year,1,1) and sb.finished_at<make_date(p_year+1,1,1))
  select jsonb_build_object('goal',(select to_jsonb(goal) from goal),'progress',jsonb_build_object('books_read',completed.count,'year',p_year,'percentage',(select least(100,round(completed.count*100.0/target_books)) from goal))) from completed;
$$;
create function writing_progress_snapshot(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'total_words',coalesce((select sum(word_count) from writing_prompt_submissions where user_id=p_user_id),0)+coalesce((select sum(word_count) from writing_challenge_submissions where user_id=p_user_id),0),
    'prompts_completed',(select count(*) from writing_prompt_submissions where user_id=p_user_id),
    'challenges_completed',(select count(*) from writing_challenge_submissions where user_id=p_user_id),
    'workshop_critiques',(select count(*) from workshop_feedback where user_id=p_user_id),
    'writing_streak',u.writing_streak,'xp',u.xp) from users u where u.id=p_user_id;
$$;
revoke all on function store_catalog_book(jsonb),set_reading_goal(uuid,integer,integer),reading_goal_snapshot(uuid,integer),writing_progress_snapshot(uuid) from public,anon,authenticated;
grant execute on function store_catalog_book(jsonb),set_reading_goal(uuid,integer,integer),reading_goal_snapshot(uuid,integer),writing_progress_snapshot(uuid) to service_role;
revoke insert,update,delete on reading_goals from anon,authenticated;
grant select,insert,update,delete on reading_goals to service_role;
notify pgrst,'reload schema';

alter table shelves add column idempotency_key text;
alter table shelves add column request_hash text;
create unique index shelves_intent on shelves(user_id,idempotency_key) where idempotency_key is not null;
create trigger shelves_intent_guard before insert on shelves for each row execute function guard_additional_content_intent('user_id');
create trigger shelves_intent_receipt after insert on shelves for each row execute function guard_additional_content_intent('user_id');
revoke insert on shelves from anon,authenticated;
grant select,insert on shelves to service_role;

create function update_shelf_progress(p_user_id uuid,p_entry_id uuid,p_pages integer,p_percent numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entry shelf_books; pages integer; changed boolean;
begin
  if (p_pages is null and p_percent is null) or p_pages<0 or p_pages>100000 or p_percent<0 or p_percent>100 then raise exception 'Invalid progress' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select sb.* into entry from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.id=p_entry_id and sb.user_id=p_user_id and s.user_id=p_user_id for update of sb;
  if not found then raise exception 'Shelf entry not found' using errcode='P1005'; end if;
  select page_count into pages from books where id=entry.book_id;
  if p_pages is not null and pages>0 and p_pages>pages then raise exception 'Progress exceeds page count' using errcode='P1004'; end if;
  if p_pages is not null and pages>0 then p_percent:=round(p_pages*100.0/pages,2); end if;
  changed:=(p_pages is not null and p_pages is distinct from entry.progress_pages) or (p_percent is not null and p_percent is distinct from entry.progress_percent);
  if changed then
    update shelf_books set progress_pages=coalesce(p_pages,progress_pages),progress_percent=coalesce(p_percent,progress_percent),updated_at=now() where id=entry.id returning * into entry;
    perform award_xp_once(p_user_id,5,'progress_update','progress:'||entry.id||':'||(now() at time zone 'UTC')::date);
  end if;
  return to_jsonb(entry);
end $$;

create function set_shelf_membership(p_user_id uuid,p_shelf_id uuid,p_book_id uuid,p_add boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target shelves;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  perform 1 from books where id=p_book_id for update;
  if not found then raise exception 'Book not found' using errcode='P1005'; end if;
  select * into target from shelves where id=p_shelf_id and user_id=p_user_id for update;
  if not found then raise exception 'Shelf not found' using errcode='P1005'; end if;
  if p_add then
    if not exists(select 1 from books where id=p_book_id) then raise exception 'Book not found' using errcode='P1005'; end if;
    insert into shelf_books(shelf_id,book_id,user_id,started_at,finished_at) values(target.id,p_book_id,p_user_id,
      case when target.default_type='currently_reading' then (now() at time zone 'UTC')::date end,
      case when target.default_type='have_read' then (now() at time zone 'UTC')::date end) on conflict(shelf_id,book_id) do nothing;
  else delete from shelf_books where shelf_id=target.id and book_id=p_book_id and user_id=p_user_id; end if;
  update books set
    currently_reading_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=p_book_id and s.default_type='currently_reading'),
    have_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=p_book_id and s.default_type='have_read'),
    want_to_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=p_book_id and s.default_type='want_to_read') where id=p_book_id;
  update users set books_read_count=count_verified_books(p_user_id) where id=p_user_id;
  return jsonb_build_object('ok',true,'defaultType',target.default_type);
end $$;

alter table challenges add column cadence text not null default 'weekly' check(cadence in ('weekly','monthly'));
alter table challenges add column goal_books integer check(goal_books>0);
alter table challenges add column goal_pages integer check(goal_pages>0);
create function join_reading_challenge(p_user_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target challenges;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into target from challenges where id=p_challenge_id for share;
  if not found then raise exception 'Challenge not found' using errcode='P1005'; end if;
  if not target.is_active or target.start_date>now() or target.end_date<=now() then raise exception 'Challenge is not active' using errcode='P1004'; end if;
  insert into challenge_participants(challenge_id,user_id) values(target.id,p_user_id) on conflict do nothing;
  return jsonb_build_object('success',true);
end $$;
create function reading_challenge_progress(p_user_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target challenges; participant challenge_participants; books_finished integer; pages_read bigint;
begin
  select * into target from challenges where id=p_challenge_id;
  if not found then raise exception 'Challenge not found' using errcode='P1005'; end if;
  select * into participant from challenge_participants where challenge_id=target.id and user_id=p_user_id;
  if not found then return jsonb_build_object('joined',false,'progress',null); end if;
  select count(*)::integer,coalesce(sum(pages),0) into books_finished,pages_read from(
    select sb.book_id,max(coalesce(b.page_count,sb.progress_pages,0)) as pages from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read'
      and sb.finished_at>=greatest(coalesce(target.start_date,'-infinity'::timestamptz),participant.joined_at)::date
      and sb.finished_at<=least(coalesce(target.end_date,now()),now())::date group by sb.book_id
  ) finished;
  return jsonb_build_object('joined',true,'joinedAt',participant.joined_at,'progress',jsonb_build_object('booksFinished',books_finished,'pagesRead',pages_read,'goalBooks',target.goal_books,'goalPages',target.goal_pages,
    'booksPercent',case when target.goal_books>0 then least(100,round(books_finished*100.0/target.goal_books)) end,
    'pagesPercent',case when target.goal_pages>0 then least(100,round(pages_read*100.0/target.goal_pages)) end));
end $$;
revoke all on function update_shelf_progress(uuid,uuid,integer,numeric),set_shelf_membership(uuid,uuid,uuid,boolean),join_reading_challenge(uuid,uuid),reading_challenge_progress(uuid,uuid) from public,anon,authenticated;
grant execute on function update_shelf_progress(uuid,uuid,integer,numeric),set_shelf_membership(uuid,uuid,uuid,boolean),join_reading_challenge(uuid,uuid),reading_challenge_progress(uuid,uuid) to service_role;
revoke insert,update,delete on challenge_participants from anon,authenticated;
grant select,insert on challenge_participants to service_role;
notify pgrst,'reload schema';

create function default_custom_shelf_slug()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not new.is_default then
    perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
    if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
    if not has_premium_access(new.user_id) and (select count(*) from shelves where user_id=new.user_id and not is_default)>=10 then raise exception 'Free shelf limit reached' using errcode='P1004'; end if;
  end if;
  if new.slug is null then new.slug:='shelf-'||new.id; end if;
  return new;
end $$;
create trigger aa_shelf_slug before insert on shelves for each row execute function default_custom_shelf_slug();

create function award_reading_goal_milestones(p_user_id uuid,p_year integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; threshold integer; receipt uuid; awarded integer:=0;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then return 0; end if;
  snapshot:=reading_goal_snapshot(p_user_id,p_year);
  for threshold in select unnest(array[25,50,75,100]) loop
    if (snapshot#>>'{progress,percentage}')::numeric>=threshold then
      insert into reading_goal_milestones(user_id,year,milestone) values(p_user_id,p_year,threshold) on conflict do nothing returning id into receipt;
      if found then
        insert into notifications(user_id,type,message) values(p_user_id,'reading_goal_milestone',format('You have read %s of %s books and reached %s%% of your %s reading goal.',snapshot#>>'{progress,books_read}',snapshot#>>'{goal,target_books}',threshold,p_year));
        awarded:=awarded+1;
      end if;
    end if;
  end loop;
  return awarded;
end $$;
revoke all on function award_reading_goal_milestones(uuid,integer) from public,anon,authenticated;
grant execute on function award_reading_goal_milestones(uuid,integer) to service_role;

create function initialize_reading_shelves()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into shelves(user_id,name,slug,is_default,default_type) values
    (new.id,'Currently Reading','currently-reading',true,'currently_reading'),
    (new.id,'Have Read','have-read',true,'have_read'),
    (new.id,'Want to Read','want-to-read',true,'want_to_read');
  return new;
end $$;
create trigger initialize_reading_shelves after insert on users for each row execute function initialize_reading_shelves();
insert into shelves(user_id,name,slug,is_default,default_type)
select u.id,defaults.name,defaults.slug||'-'||u.id,true,defaults.kind from users u cross join(values
  ('Currently Reading','currently-reading','currently_reading'),('Have Read','have-read','have_read'),('Want to Read','want-to-read','want_to_read')
) defaults(name,slug,kind) where not exists(select 1 from shelves s where s.user_id=u.id and s.default_type=defaults.kind);

create function sync_profile_reading_goal()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if pg_trigger_depth()>1 or new.annual_reading_goal is not distinct from old.annual_reading_goal then return new; end if;
  if new.annual_reading_goal is null then
    delete from reading_goals where user_id=new.id and year=extract(year from now() at time zone 'UTC')::integer;
  else
    if new.annual_reading_goal not between 1 and 10000 then raise exception 'Invalid goal' using errcode='P1004'; end if;
    insert into reading_goals(user_id,year,target_books) values(new.id,extract(year from now() at time zone 'UTC')::integer,new.annual_reading_goal)
      on conflict(user_id,year) do update set target_books=excluded.target_books,updated_at=now();
  end if;
  return new;
end $$;
create trigger sync_profile_reading_goal after update of annual_reading_goal on users for each row execute function sync_profile_reading_goal();
