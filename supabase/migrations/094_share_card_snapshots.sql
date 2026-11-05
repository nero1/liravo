create function share_card_snapshot(p_kind text,p_target uuid,p_owner uuid default null,p_actor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=p_owner;reader users;document jsonb;edition uuid;shelf shelves;progress jsonb;challenge challenges;
begin
 if p_actor is not null and not exists(select 1 from users where id=p_actor and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_kind='book'then return reading_edition_document(p_target);end if;
 if p_kind='quote'then
  select q.user_id,jsonb_build_object('content',q.content,'book',reading_edition_document(q.book_id))into owner_id,document from quotes q where q.id=p_target and not q.is_hidden;
 elsif p_kind='review'then
  select r.user_id,jsonb_build_object('content',r.content,'rating',r.rating,'book',reading_edition_document(r.book_id))into owner_id,document from reviews r where r.id=p_target and not r.is_hidden and r.moderation_status='published';
 elsif p_kind='challenge'then
  select * into challenge from challenges where id=p_target;if not found then return null;end if;
  document:=jsonb_build_object('title',challenge.title);
 elsif p_kind='writing-challenge'then
  select jsonb_build_object('title',title)into document from writing_challenges where id=p_target;if document is null then return null;end if;
 elsif p_kind not in('finished','shelf')then raise exception 'Invalid share target' using errcode='P1004';
 end if;
 if p_kind in('quote','review')and document is null then return null;end if;
 if owner_id is null then
  if p_kind in('challenge','writing-challenge')then return document;end if;
  return null;
 end if;
 select * into reader from users where id=owner_id;
 if not found or not reading_author_visible(p_actor,owner_id)then return null;end if;
 if p_kind in('finished','shelf','challenge')then
  select * into shelf from shelves where user_id=owner_id and default_type='have_read';
  if not found then return null;end if;
  if p_actor is distinct from owner_id and(not shelf.is_public or reader.shelf_visibility='private'or(reader.shelf_visibility='followers_only'and not exists(select 1 from follows where follower_id=p_actor and following_id=owner_id)))then return null;end if;
 end if;
 if p_kind='finished'then
  select coalesce(canonical_edition_id,id)into edition from books where id=p_target;if not found then return null;end if;
  if not exists(select 1 from shelf_books sb join books b on b.id=sb.book_id where sb.shelf_id=shelf.id and sb.user_id=owner_id and coalesce(b.canonical_edition_id,b.id)=edition and(sb.finished_at is null or sb.finished_at<=(now()at time zone 'UTC')::date))then return null;end if;
  document:=jsonb_build_object('book',reading_edition_document(edition),'review',(
   select jsonb_build_object('rating',r.rating,'content',r.content)from reviews r join books b on b.id=r.book_id where r.user_id=owner_id and coalesce(b.canonical_edition_id,b.id)=edition and not r.is_hidden and r.moderation_status='published'order by r.created_at desc,r.id desc limit 1));
 elsif p_kind='shelf'then
  document:=jsonb_build_object('books',coalesce((select jsonb_agg(entry->'book'order by at desc,edition_id desc)from(select * from shelf_edition_rows(shelf.id)order by at desc,edition_id desc limit 6)rows),'[]'::jsonb));
 elsif p_kind='challenge'then
  progress:=reading_challenge_progress(owner_id,p_target);if not(progress->>'joined')::boolean then return null;end if;
  progress:=progress->'progress';
  document:=document||jsonb_build_object('progress',progress,'completed',
   (coalesce(challenge.goal_books,0)>0 or coalesce(challenge.goal_pages,0)>0)
   and(coalesce(challenge.goal_books,0)<=0 or(progress->>'booksFinished')::integer>=challenge.goal_books)
   and(coalesce(challenge.goal_pages,0)<=0 or(progress->>'pagesRead')::bigint>=challenge.goal_pages));
 elsif p_kind='writing-challenge'then
  if not exists(select 1 from writing_challenge_participants where challenge_id=p_target and user_id=owner_id)and not exists(select 1 from writing_challenge_submissions where challenge_id=p_target and user_id=owner_id)then return null;end if;
  document:=document||jsonb_build_object('submissionCount',(select count(*)from writing_challenge_submissions where challenge_id=p_target and user_id=owner_id));
 end if;
 return document||jsonb_build_object('reader',jsonb_build_object('display_name',coalesce(nullif(reader.display_name,''),reader.username),'avatar_url',reader.avatar_url));
end $$;
revoke all on function share_card_snapshot(text,uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function share_card_snapshot(text,uuid,uuid,uuid)to service_role;
notify pgrst,'reload schema';
