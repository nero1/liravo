create index quote_owner_cursor on quotes(user_id,created_at desc,id desc) where not is_hidden;
create index quote_book_cursor on quotes(book_id,created_at desc,id desc) where not is_hidden;
create index debate_catalog_cursor on book_debates(created_at desc,id desc);
create index challenge_catalog_cursor on challenges(created_at desc,id desc);
create index challenge_roster_cursor on challenge_participants(challenge_id,joined_at,user_id);

create function guard_reading_debate()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(new.question))not between 5 and 200 then raise exception 'Question required' using errcode='P1004';end if;
  return new;
end $$;
create trigger aa_reading_debate_guard before insert or update of question on book_debates for each row execute function guard_reading_debate();
revoke all on function guard_reading_debate()from public,anon,authenticated;

create function reading_author_visible(p_user uuid,p_author uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from users u where u.id=p_author and not u.is_banned and u.deleted_at is null and(u.profile_visibility='public' or u.id=p_user or exists(select 1 from follows where follower_id=p_user and following_id=u.id)));
$$;
create function reading_edition_document(p_book uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_10',b.isbn_10,'isbn_13',b.isbn_13,'language',b.language,'format',b.format)
  from books source join books b on b.id=coalesce(source.canonical_edition_id,source.id) where source.id=p_book;
$$;
create function quote_catalog_snapshot(p_user uuid,p_owner uuid default null,p_book uuid default null,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare edition uuid;owner_id uuid:=coalesce(p_owner,p_user);
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_book is null then
    if not exists(select 1 from users where id=owner_id and not is_banned and deleted_at is null) then raise exception 'Reader unavailable' using errcode='P1005';end if;
    if not reading_author_visible(p_user,owner_id) then raise exception 'Reader unavailable' using errcode='P1003';end if;
  else
    select coalesce(canonical_edition_id,id) into edition from books where id=p_book;
    if not found then raise exception 'Edition unavailable' using errcode='P1005';end if;
  end if;
  return(with eligible as materialized(select q.id,q.content,q.page_number,q.user_id,q.book_id,q.created_at from quotes q join books b on b.id=q.book_id
    where not q.is_hidden and(case when p_book is null then q.user_id=owner_id else coalesce(b.canonical_edition_id,b.id)=edition end)and reading_author_visible(p_user,q.user_id)),
    page as materialized(select * from eligible where p_at is null or(created_at,id)<(p_at,p_id) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('quotes',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'content',p.content,'page_number',p.page_number,'user_id',p.user_id,'book_id',p.book_id,'created_at',p.created_at,
      'books',reading_edition_document(p.book_id),'users',jsonb_build_object('username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url)) order by p.created_at desc,p.id desc) from page p join users u on u.id=p.user_id),'[]'::jsonb),'total',(select count(*) from eligible)));
end $$;

create function debate_document(p_user uuid,p_debate uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',d.id,'book_id',d.book_id,'user_id',d.user_id,'question',d.question,'yes_count',d.yes_count,'no_count',d.no_count,'is_active',d.is_active,'created_at',d.created_at,
    'can_share',reading_author_visible(null,d.user_id),'current_vote',(select vote from debate_votes where debate_id=d.id and user_id=p_user),'can_vote',p_user is not null and d.is_active and not exists(select 1 from debate_votes where debate_id=d.id and user_id=p_user),'book',reading_edition_document(d.book_id))
  from book_debates d where d.id=p_debate and reading_author_visible(p_user,d.user_id);
$$;
create function debate_catalog_snapshot(p_user uuid default null,p_scope text default 'active',p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope not in('active','mine') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if(p_user is null and p_scope='mine')or(p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null))then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select d.id,d.created_at from book_debates d where reading_author_visible(p_user,d.user_id)
    and(case when p_scope='mine' then d.user_id=p_user or exists(select 1 from debate_votes where debate_id=d.id and user_id=p_user)else d.is_active end)
    and(p_at is null or(d.created_at,d.id)<(p_at,p_id))order by d.created_at desc,d.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('debates',coalesce((select jsonb_agg(debate_document(p_user,id)order by created_at desc,id desc)from page),'[]'::jsonb)));
end $$;
create function debate_detail_snapshot(p_user uuid,p_debate uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare document jsonb;
begin
  if p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  document:=debate_document(p_user,p_debate);if document is null then raise exception 'Debate unavailable' using errcode='P1005';end if;
  return jsonb_build_object('debate',document);
end $$;
create or replace function cast_debate_vote(p_user_id uuid,p_debate_id uuid,p_vote text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare debate book_debates;previous text;visible boolean;
begin
  if p_vote is null or p_vote not in('yes','no')then raise exception 'Invalid vote' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Forbidden' using errcode='P1003';end if;
  select * into debate from book_debates where id=p_debate_id for update;if not found then raise exception 'Unknown debate' using errcode='P1005';end if;
  visible:=reading_author_visible(p_user_id,debate.user_id);
  select vote into previous from debate_votes where debate_id=p_debate_id and user_id=p_user_id;
  if found then
    if previous<>p_vote then raise exception 'Vote is final' using errcode='P1001';end if;
    return jsonb_build_object('success',true,'vote',previous,'alreadyVoted',true,'yes_count',case when visible then debate.yes_count end,'no_count',case when visible then debate.no_count end);
  end if;
  if not visible then raise exception 'Debate unavailable' using errcode='P1003';end if;
  if not debate.is_active then raise exception 'Debate closed' using errcode='P1004';end if;
  insert into debate_votes(debate_id,user_id,vote)values(p_debate_id,p_user_id,p_vote);
  update book_debates set yes_count=yes_count+case when p_vote='yes' then 1 else 0 end,no_count=no_count+case when p_vote='no' then 1 else 0 end where id=p_debate_id returning * into debate;
  return jsonb_build_object('success',true,'vote',p_vote,'yes_count',debate.yes_count,'no_count',debate.no_count);
end $$;

create or replace function reading_challenge_progress(p_user_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target challenges;participant challenge_participants;books_finished integer;pages_read bigint;
begin
  select * into target from challenges where id=p_challenge_id;if not found then raise exception 'Challenge not found' using errcode='P1005';end if;
  select * into participant from challenge_participants where challenge_id=target.id and user_id=p_user_id;
  if not found then return jsonb_build_object('joined',false,'progress',null);end if;
  select count(*)::integer,coalesce(sum(pages),0)into books_finished,pages_read from(
    select distinct on(canonical_book_work(b.work_id))canonical_book_work(b.work_id)as work_id,coalesce(b.page_count,greatest(0,sb.progress_pages),0)as pages
    from shelf_books sb join shelves s on s.id=sb.shelf_id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read'
      and sb.finished_at>=(greatest(coalesce(target.start_date,'-infinity'::timestamptz),participant.joined_at)at time zone 'UTC')::date
      and sb.finished_at<=(now()at time zone 'UTC')::date and(target.end_date is null or(sb.finished_at::timestamp at time zone 'UTC')<target.end_date)
    order by canonical_book_work(b.work_id),sb.finished_at desc,sb.id desc
  )finished;
  return jsonb_build_object('joined',true,'joinedAt',participant.joined_at,'progress',jsonb_build_object('booksFinished',books_finished,'pagesRead',pages_read,'goalBooks',target.goal_books,'goalPages',target.goal_pages,
    'booksPercent',case when target.goal_books>0 then least(100,round(books_finished*100.0/target.goal_books))end,'pagesPercent',case when target.goal_pages>0 then least(100,round(pages_read*100.0/target.goal_pages))end));
end $$;
create function reading_challenge_document(p_user uuid,p_challenge uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'type',c.type,'cadence',c.cadence,'start_date',c.start_date,'end_date',c.end_date,'is_active',c.is_active,'goal_books',c.goal_books,'goal_pages',c.goal_pages,'created_at',c.created_at,
    'participant_count',(select count(*)from challenge_participants where challenge_id=c.id),'joined',exists(select 1 from challenge_participants where challenge_id=c.id and user_id=p_user),
    'can_join',c.is_active and coalesce(c.start_date<=now(),true)and coalesce(c.end_date>now(),true)and not exists(select 1 from challenge_participants where challenge_id=c.id and user_id=p_user))
  from challenges c where c.id=p_challenge;
$$;
create function reading_challenge_catalog_snapshot(p_user uuid,p_scope text default 'active',p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope not in('active','mine')then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select c.id,c.created_at from challenges c where(case when p_scope='mine' then exists(select 1 from challenge_participants where challenge_id=c.id and user_id=p_user)else c.is_active and coalesce(c.start_date<=now(),true)and coalesce(c.end_date>now(),true)end)
    and(p_at is null or(c.created_at,c.id)<(p_at,p_id))order by c.created_at desc,c.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('challenges',coalesce((select jsonb_agg(reading_challenge_document(p_user,id)order by created_at desc,id desc)from page),'[]'::jsonb)));
end $$;
create function reading_challenge_detail_snapshot(p_user uuid,p_challenge uuid,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare document jsonb;
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  document:=reading_challenge_document(p_user,p_challenge);if document is null then raise exception 'Challenge unavailable' using errcode='P1005';end if;
  return(with page as materialized(select u.id,u.username,u.display_name,u.avatar_url,m.joined_at from challenge_participants m join users u on u.id=m.user_id where m.challenge_id=p_challenge and(p_at is null or(m.joined_at,m.user_id)>(p_at,p_id))order by m.joined_at,m.user_id limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('challenge',document,'participants',coalesce((select jsonb_agg(to_jsonb(page)order by joined_at,id)from page),'[]'::jsonb))||reading_challenge_progress(p_user,p_challenge));
end $$;
create or replace function join_reading_challenge(p_user_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target challenges;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into target from challenges where id=p_challenge_id for share;if not found then raise exception 'Challenge not found' using errcode='P1005';end if;
  if exists(select 1 from challenge_participants where challenge_id=p_challenge_id and user_id=p_user_id)then return jsonb_build_object('success',true,'joined',true);end if;
  if not target.is_active or target.start_date>now()or target.end_date<=now()then raise exception 'Challenge is not active' using errcode='P1004';end if;
  insert into challenge_participants(challenge_id,user_id)values(target.id,p_user_id)on conflict do nothing;
  return jsonb_build_object('success',true,'joined',true);
end $$;
revoke all on function reading_author_visible(uuid,uuid),reading_edition_document(uuid),quote_catalog_snapshot(uuid,uuid,uuid,timestamptz,uuid,integer),debate_document(uuid,uuid),debate_catalog_snapshot(uuid,text,timestamptz,uuid,integer),debate_detail_snapshot(uuid,uuid),reading_challenge_document(uuid,uuid),reading_challenge_catalog_snapshot(uuid,text,timestamptz,uuid,integer),reading_challenge_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)from public,anon,authenticated;
grant execute on function quote_catalog_snapshot(uuid,uuid,uuid,timestamptz,uuid,integer),debate_catalog_snapshot(uuid,text,timestamptz,uuid,integer),debate_detail_snapshot(uuid,uuid),reading_challenge_catalog_snapshot(uuid,text,timestamptz,uuid,integer),reading_challenge_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)to service_role;
notify pgrst,'reload schema';
