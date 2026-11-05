import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';

const schema=readFileSync('supabase/migrations/001_schema.sql','utf8');
const create=()=>new PGlite();
const plain=create();
beforeAll(async()=>{await plain.exec(schema);},60_000);
afterAll(async()=>{await plain.close();});

it('enforces profile and shelf privacy for real browser roles, followers and inactive accounts',async()=>{
 const db=plain,owner=crypto.randomUUID(),viewer=crypto.randomUUID();try{
  for(const [id,name]of[[owner,'owner'],[viewer,'viewer']])await db.query('select create_direct_account($1,$2,$3,$3)',[id,name+'@example.test','privacy_'+name]);
  await db.query("update users set profile_visibility='followers_only',shelf_visibility='private',bio='Private biography'where id=$1",[owner]);
  const shelf=(await db.query<{id:string}>('select id from shelves where user_id=$1 limit 1',[owner])).rows[0].id;
  const book=(await db.query<{id:string}>("insert into books(title,author_name)values('Privacy fixture','Fixture')returning id")).rows[0].id;
  await db.query('select set_shelf_membership($1,$2,$3,true)',[owner,shelf,book]);
  const visible=async()=>({profiles:(await db.query('select bio from users where id=$1',[owner])).rows.length,shelves:(await db.query('select id from shelves where id=$1',[shelf])).rows.length,books:(await db.query('select book_id from shelf_books where shelf_id=$1',[shelf])).rows.length});
  await db.exec('set role anon');expect(await visible()).toEqual({profiles:0,shelves:0,books:0});
  await db.exec('reset role');await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[viewer]);expect(await visible()).toEqual({profiles:0,shelves:0,books:0});
  await db.exec('reset role');await db.query('insert into follows(follower_id,following_id)values($1,$2)',[viewer,owner]);
  await db.exec('set role authenticated');expect(await visible()).toEqual({profiles:1,shelves:0,books:0});
  await db.exec('reset role');await db.query("update users set shelf_visibility='followers_only'where id=$1",[owner]);await db.exec('set role authenticated');expect(await visible()).toEqual({profiles:1,shelves:1,books:1});
  await db.exec('reset role');await db.query('update users set is_banned=true where id=$1',[viewer]);await db.exec('set role authenticated');expect(await visible()).toEqual({profiles:0,shelves:0,books:0});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);expect(await visible()).toEqual({profiles:1,shelves:1,books:1});
  await db.exec('reset role');await db.query('update users set deleted_at=now()where id=$1',[owner]);await db.exec('set role authenticated');expect(await visible()).toEqual({profiles:0,shelves:0,books:0});
  await db.exec('reset role');await db.query('update users set is_admin=true,is_banned=false,deleted_at=now()where id=$1',[viewer]);
  await expect(db.query('select set_premium_override_atomic($1,$2,true,$3)',[viewer,owner,'deleted-admin'])).rejects.toMatchObject({code:'P1003'});
  await expect(db.query('select claim_payout_request($1,$2,$3)',[viewer,crypto.randomUUID(),'deleted-admin'])).rejects.toMatchObject({code:'P1003'});
  await expect(db.query("select settle_payout_request($1,$2,'completed','receipt',1,'USD',null,'deleted-admin')",[viewer,crypto.randomUUID()])).rejects.toMatchObject({code:'P1003'});
  await expect(db.query("select release_legacy_payout_request($1,$2,'receipt',1,'USD','deleted-admin')",[viewer,crypto.randomUUID()])).rejects.toMatchObject({code:'P1003'});
 }finally{await db.exec('reset role');}
},30_000);

it('creates a usable plain PostgreSQL database without Supabase tables and rejects accidental reruns',async()=>{
 const db=plain;try{
  expect((await db.query("select count(*)::int count from pg_extension where extname<>'plpgsql'")).rows).toEqual([{count:0}]);
  expect((await db.query("select to_regclass('auth.users')auth_users,to_regclass('storage.objects')storage_objects")).rows).toEqual([{auth_users:null,storage_objects:null}]);
  const id='00000000-0000-4000-8000-000000001104';
  const profile=(await db.query<{profile:{id:string}}>("select create_direct_account($1,'plain@example.test','plain_reader','Plain reader')profile",[id])).rows[0].profile;
  expect(profile.id).toBe(id);expect((await db.query('select count(*)::int count from shelves where user_id=$1',[id])).rows).toEqual([{count:3}]);
  expect((await db.query("select count(*)::int count from pg_tables where schemaname='public'")).rows).toEqual([{count:122}]);
  await expect(db.exec(schema)).rejects.toThrow('Use a new database with an empty public schema');await db.exec('ROLLBACK');
  expect((await db.query('select id from users where id=$1',[id])).rows).toEqual([{id}]);
 }finally{await db.exec('reset role');}
},30_000);

it('overrides inherited Supabase browser grants while retaining managed auth and storage boundaries',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
   create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role()returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'service_role')::text$$;
   create extension pg_trgm with schema public;
   create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null);
   alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;
   grant select,insert,update,delete on storage.objects to anon,authenticated;
   create policy fixture_access on storage.objects for all to anon,authenticated using(true)with check(true);
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
  `);
  const helper=(await db.query("select pg_get_functiondef('auth.uid()'::regprocedure)definition")).rows;
  await db.exec(schema);
  expect((await db.query("select pg_get_functiondef('auth.uid()'::regprocedure)definition")).rows).toEqual(helper);
  expect((await db.query("select has_function_privilege('authenticated','public.similarity(text,text)','execute')allowed")).rows).toEqual([{allowed:true}]);
  for(const role of['anon','authenticated']){
   expect((await db.query("select has_column_privilege($1,'public.users','id','select')profile,has_column_privilege($1,'public.users','email','select')email,has_column_privilege($1,'public.users','pin_hash','select')pin,has_function_privilege($1,'set_feature_flag_atomic(uuid,text,boolean)','execute')flags,has_table_privilege($1,'payout_requests','insert')payout,has_table_privilege($1,'review_likes','insert')likes",[role])).rows).toEqual([{profile:true,email:false,pin:false,flags:false,payout:false,likes:false}]);
  }
  expect((await db.query("select has_function_privilege('service_role','set_feature_flag_atomic(uuid,text,boolean)','execute')flags,has_function_privilege('service_role','apply_community_intent_before095(uuid,text,uuid,text,jsonb,text)','execute')bypass")).rows).toEqual([{flags:true,bypass:false}]);
  const id='00000000-0000-4000-8000-000000002104';
  await db.query("insert into auth.users(id,email,raw_user_meta_data)values($1,'managed@example.test','{\"username\":\"managed_reader\"}')",[id]);
  expect((await db.query('select id from users where id=$1',[id])).rows).toEqual([{id}]);
  const notice=(await db.query<{id:string}>("insert into notifications(user_id,type,message,message_key,message_values)values($1,'reading_goal_milestone','Goal','readingGoal','{\"count\":1,\"target\":4,\"percent\":25,\"year\":\"2026\"}')returning id",[id])).rows[0].id;
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  expect((await db.query('update notifications set is_read=true where id=$1 returning is_read',[notice])).rows).toEqual([{is_read:true}]);
  await expect(db.query("update notifications set message='forged'where id=$1",[notice])).rejects.toThrow();
  await expect(db.exec("insert into storage.objects(bucket_id)values('avatars')")).rejects.toThrow();
  await db.exec("insert into storage.objects(bucket_id)values('other')");await db.exec('reset role');
 }finally{await db.close();}
},30_000);
