create index book_pass_sent_cursor on book_passes(sender_id,created_at desc,id desc);
create index book_pass_received_cursor on book_passes(recipient_id,created_at desc,id desc);
create index book_chain_cursor on pass_the_book_chains(created_at desc,id desc);
create index book_chain_roster_cursor on pass_the_book_nodes(chain_id,position,id);

create function book_chain_node_document(p_node uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',n.id,'chain_id',n.chain_id,'user_id',n.user_id,'nominee_id',n.nominee_id,'note',n.note,'position',n.position,'created_at',n.created_at,'reader',case when u.id is null then null else jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url)end)
 from pass_the_book_nodes n left join users u on u.id=n.user_id and not u.is_banned and u.deleted_at is null where n.id=p_node;
$$;
create function book_pass_catalog_snapshot(p_user uuid,p_scope text,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_scope is null or p_scope not in('chains','received','sent') or p_limit is null or p_limit not between 1 and 100 or(p_at is null)<>(p_id is null)then raise exception 'Invalid catalog' using errcode='P1004';end if;
 if p_scope='chains' then
  return jsonb_build_object('total',(select count(*)from pass_the_book_chains),'items',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('books',catalog_book_snapshot(c.book_id),'reader_count',(select count(*)from pass_the_book_nodes where chain_id=c.id),'can_nominate',exists(select 1 from pass_the_book_nodes where chain_id=c.id and user_id=p_user and nominee_id is null),'nodes',coalesce((select jsonb_agg(book_chain_node_document(n.id)order by n.position,n.id)from(select id,position from pass_the_book_nodes where chain_id=c.id order by position,id limit 5)n),'[]'::jsonb))order by c.created_at desc,c.id desc)from(select * from pass_the_book_chains where p_at is null or(created_at,id)<(p_at,p_id)order by created_at desc,id desc limit p_limit+1)c),'[]'::jsonb));
 end if;
 return jsonb_build_object('total',(select count(*)from book_passes where case p_scope when 'received' then recipient_id=p_user else sender_id=p_user end),'items',coalesce((select jsonb_agg((to_jsonb(p)-'idempotency_key'-'request_hash')||jsonb_build_object('book',catalog_book_snapshot(p.book_id),'sender',case when sender.id is null then null else jsonb_build_object('id',sender.id,'username',sender.username,'display_name',sender.display_name)end,'recipient',case when recipient.id is null then null else jsonb_build_object('id',recipient.id,'username',recipient.username,'display_name',recipient.display_name)end)order by p.created_at desc,p.id desc)from(select * from book_passes where(case p_scope when 'received' then recipient_id=p_user else sender_id=p_user end)and(p_at is null or(created_at,id)<(p_at,p_id))order by created_at desc,id desc limit p_limit+1)p left join users sender on sender.id=p.sender_id and not sender.is_banned and sender.deleted_at is null left join users recipient on recipient.id=p.recipient_id and not recipient.is_banned and recipient.deleted_at is null),'[]'::jsonb));
end $$;
create function book_chain_roster_snapshot(p_user uuid,p_chain uuid,p_position integer default -1,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if not exists(select 1 from pass_the_book_chains where id=p_chain)then raise exception 'Chain unavailable' using errcode='P1005';end if;
 if p_position is null or p_position< -1 or(p_position=-1)<>(p_id is null)or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid roster' using errcode='P1004';end if;
 return jsonb_build_object('total',(select count(*)from pass_the_book_nodes where chain_id=p_chain),'nodes',coalesce((select jsonb_agg(book_chain_node_document(n.id)order by position,id)from(select id,position from pass_the_book_nodes where chain_id=p_chain and(p_position=-1 or(position,id)>(p_position,p_id)) order by position,id limit p_limit+1)n),'[]'::jsonb));
end $$;

create function apply_book_chain_intent(p_actor_id uuid,p_action text,p_target uuid,p_key text,p_payload jsonb,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_action is null or p_action not in('chain_create','chain_nominate')then raise exception 'Invalid chain action' using errcode='P1004';end if;
 result:=apply_community_intent(p_actor_id,p_action,p_target,p_key,p_payload,p_correlation_id);
 if not exists(select 1 from users where id=p_actor_id and not is_banned and deleted_at is null)or p_action='chain_nominate' and not exists(select 1 from users where id=(p_payload->>'nominee_id')::uuid and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 result:=result||jsonb_build_object('actorId',p_actor_id,'chainId',case when p_action='chain_create' then result->'chain'->>'id' else p_target::text end)||case when p_action='chain_create' then jsonb_build_object('bookId',p_target)else jsonb_build_object('nomineeId',p_payload->>'nominee_id')end;
 update content_intents set response=result where actor_id=p_actor_id and action=p_action and intent_key=p_key;
 return result;
end $$;
create function guard_book_pass_accounts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=new.sender_id and not is_banned and deleted_at is null)or not exists(select 1 from users where id=new.recipient_id and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 return new;
end $$;
create trigger zz_book_pass_accounts before insert on book_passes for each row execute function guard_book_pass_accounts();

create function book_pass_receipt_snapshot(p_user uuid,p_action text,p_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare receipt jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_action is null or p_action not in('book_passes','chain_create','chain_nominate') or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 select response into receipt from content_intents where actor_id=p_user and action=p_action and intent_key=p_key;
 if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return case when p_action='book_passes' then jsonb_build_object('actorId',p_user,'pass',receipt)else receipt end;
end $$;
revoke all on function book_chain_node_document(uuid),book_pass_catalog_snapshot(uuid,text,timestamptz,uuid,integer),book_chain_roster_snapshot(uuid,uuid,integer,uuid,integer),apply_book_chain_intent(uuid,text,uuid,text,jsonb,text),guard_book_pass_accounts(),book_pass_receipt_snapshot(uuid,text,text)from public,anon,authenticated;
grant execute on function book_pass_catalog_snapshot(uuid,text,timestamptz,uuid,integer),book_chain_roster_snapshot(uuid,uuid,integer,uuid,integer),apply_book_chain_intent(uuid,text,uuid,text,jsonb,text),book_pass_receipt_snapshot(uuid,text,text)to service_role;
notify pgrst,'reload schema';
