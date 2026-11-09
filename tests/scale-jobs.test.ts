import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import postgres from 'postgres';
import {readFileSync} from 'node:fs';
const url=process.env.SCALE_TEST_DATABASE_URL;
if(url&&!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Scale checks require an isolated loopback database');
const prefix=crypto.randomUUID().slice(0,8),id=(n:number)=>prefix+'-0105-4105-8000-'+n.toString(16).padStart(12,'0');
const sql=url?postgres(url,{max:4,ssl:false,prepare:false,onnotice:()=>{}}):null;
beforeAll(async()=>{if(!sql)return;const [{count}]=await sql`select count(*)::int count from pg_tables where schemaname='public'`;if(!count){const connection=await sql.reserve();try{await connection.unsafe(readFileSync('supabase/migrations/001_schema.sql','utf8')).simple();}finally{connection.release();}}
 await sql!`insert into book_works(id,title,author_name)select (${prefix+'-0105-4105-8000-'}||lpad(to_hex(n),12,'0'))::uuid,'Scale work '||n,'Scale Author'from generate_series(1,5025)n`;
 await sql!`insert into books(id,work_id,title,author_name,genres)select id,id,title,author_name,array['Scale genre']from book_works where id>=${id(1)} and id<=${id(5025)}`;
},60000);
afterAll(async()=>{await sql?.end();});
const test=it.skipIf(!sql);
async function claim(name:string){const owner=crypto.randomUUID();const [{fence}]=await sql!`select claim_maintenance_job(${name},${owner})fence`;if(!fence)throw Error('Fixture job unavailable');return {name,owner,epoch:Number(fence.epoch)};}
async function run(fence:Awaited<ReturnType<typeof claim>>,fn:string,args:postgres.JSONValue={}){return(await sql!`select run_maintenance_rpc(${fence.name},${fence.owner},${fence.epoch},${fn},${sql!.json(args)})receipt`)[0].receipt;}
async function release(fence:Awaited<ReturnType<typeof claim>>){await sql!`select release_maintenance_job(${fence.name},${fence.owner},${fence.epoch})`;}
async function account(){const id=crypto.randomUUID(),name='scale_'+id.slice(0,12).replaceAll('-','');await sql!`select create_direct_account(${id},${name+'@example.test'},${name},'Scale fixture')`;return id;}

test('fences scalar/array RPCs and raw Data API mutations against replaced job ownership',async()=>{
 const user=await account(),fence=await claim('fixture-fence-'+crypto.randomUUID());
 expect(await run(fence,'writing_prompt_leaderboard',{p_period:'all_time',p_viewer:null})).toBeInstanceOf(Array);
 await sql!`update maintenance_jobs set lease_until=now()-interval '1 second'where name=${fence.name}`;const replacement=await claim(fence.name);
 await expect(run(fence,'update_profile_atomic',{p_user_id:user,p_patch:{display_name:'Stale worker'}})).rejects.toMatchObject({code:'P1001'});
 await expect(sql!.begin(async tx=>{await tx`select set_config('request.headers',${JSON.stringify({'x-liravo-maintenance':JSON.stringify(fence)})},true)`;await tx`update users set display_name='Stale REST worker'where id=${user}`;})).rejects.toMatchObject({code:'P1001'});
 expect((await sql!`select display_name from users where id=${user}`)[0].display_name).toBe('Scale fixture');await release(replacement);
 for(const role of['anon','authenticated'])expect((await sql!`select has_table_privilege(${role},'maintenance_jobs','select')allowed`)[0].allowed).toBe(false);
});

test('ranks complete writing histories beyond Data API row caps while respecting profile privacy',async()=>{
 const writer=await account();
 await sql!`with prompts as(insert into writing_prompts(prompt_text)select 'Scale prompt '||n from generate_series(1,1005)n returning id)insert into writing_prompt_submissions(prompt_id,user_id,content)select id,${writer},'A complete submission'from prompts`;
 const [{board}]=await sql!`select writing_prompt_leaderboard('all_time',null)board`;expect(board.find((row:{user_id:string})=>row.user_id===writer).submissions_count).toBe(1005);
 await sql!`update users set profile_visibility='followers_only'where id=${writer}`;
 expect((await sql!`select writing_prompt_leaderboard('all_time',null)board`)[0].board.some((row:{user_id:string})=>row.user_id===writer)).toBe(false);
 expect((await sql!`select writing_prompt_leaderboard('all_time',${writer})board`)[0].board.find((row:{user_id:string})=>row.user_id===writer).submissions_count).toBe(1005);
 await expect(sql!`select writing_prompt_leaderboard('invalid',null)`).rejects.toMatchObject({code:'P1004'});
});

test('resumes past 5000 works and returns deterministic canonical-work recommendations',async()=>{
 const fence=await claim('similar-books');await sql!`update maintenance_jobs set after_id=${id(5000)} where name='similar-books'`;
 const receipt=await run(fence,'compute_similar_books_batch',{p_limit:25});expect(receipt.scanned).toBeGreaterThan(0);expect(receipt.processed).toBeGreaterThan(0);
 const [{after_id}]=await sql!`select after_id from maintenance_jobs where name='similar-books'`;expect(receipt.complete?after_id===null:after_id>id(5000)).toBe(true);
 const records=await sql!`select * from similar_books_computed where work_id>${id(5000)} and work_id<=${id(5025)}`;expect(records.length).toBe(receipt.processed);expect(records.every(row=>row.similar_ids.length<=5)).toBe(true);
 const source=records[0].work_id;const [{books}]=await sql!`select similar_book_snapshot(${source})books`;expect(books.length).toBeGreaterThan(0);expect(new Set(books.map((book:{id:string})=>book.id)).size).toBe(books.length);expect(books.some((book:{id:string})=>book.id===source)).toBe(false);
 await release(fence);
},60000);

test('keeps reminder/health writes idempotent and sitemap pages complete, public and canonical',async()=>{
 const reader=await account(),privateOwner=await account();await sql!`update users set email=null,created_at=now()-interval '8 days'where id=${reader}`;
 const hardening=await claim('account-hardening');const first=await run(hardening,'account_hardening_batch',{p_limit:1000});expect(first.notified).toBeGreaterThan(0);expect((await run(hardening,'account_hardening_batch',{p_limit:1000})).notified).toBe(0);await release(hardening);
 const health=await claim('affiliate-health');expect((await run(health,'check_affiliate_health')).checked).toBeGreaterThan(0);expect((await run(health,'check_affiliate_health')).logged).toBe(0);await release(health);
 await sql!`update users set is_verified_author=true,profile_visibility='followers_only'where id=${privateOwner}`;
 const [{id:list}]=await sql!`insert into reading_lists(user_id,name,is_public)values(${privateOwner},'Private owner fixture',true)returning id`;
 expect((await sql!`select reading_list_document(null,${list})document`)[0].document).toBeNull();
 const partitions=(await sql!`select public_sitemap_partitions(0)parts`)[0].parts;expect(partitions.filter((part:{kind:string})=>part.kind==='books').length).toBeGreaterThan(5);
 let count=0;for(const part of partitions){const [{page}]=await sql!`select public_sitemap_page(${part.kind},${part.first},${part.until})page`;expect(page.length).toBeLessThanOrEqual(1000);expect(page.some((entry:{id:string})=>entry.id===list||entry.id===privateOwner)).toBe(false);if(part.kind==='books')count+=page.length;}
 expect(count).toBe((await sql!`select count(*)::int count from books where canonical_edition_id is null`)[0].count);
});

test('prunes operational history in bounded batches while preserving financial and replay proofs',async()=>{
 const reader=await account();const [{id:notice}]=await sql!`insert into notifications(user_id,type,message,created_at)values(${reader},'test','Old fixture',now()-interval '181 days')returning id`;
 const [{id:proof}]=await sql!`insert into outbox_events(aggregate_type,aggregate_id,event_type,payload,status,created_at,processed_at)values('tip',${crypto.randomUUID()},'notify_recipient','{"private":"payload"}','processed',now()-interval '40 days',now()-interval '40 days')returning id`;
 const [{id:expired}]=await sql!`insert into outbox_events(aggregate_type,aggregate_id,event_type,payload,status,created_at,processed_at)values('reading','fixture','check_badges','{}','processed',now()-interval '40 days',now()-interval '40 days')returning id`;
 const result=(await sql!`select prune_operational_history(1)result`)[0].result;expect(result.notifications).toBeLessThanOrEqual(1);expect((await sql!`select id from notifications where id=${notice}`).length).toBe(0);expect((await sql!`select id from outbox_events where id=${expired}`).length).toBe(0);expect((await sql!`select payload from outbox_events where id=${proof}`)[0].payload).toEqual({});
});

test('paginates tied author posts and owned reading sessions without omissions',async()=>{
 const author=await account(),reader=await account(),book=(await sql!`select id from books limit 1`)[0].id;
 await sql!`update users set user_types=array['author']where id=${author}`;
 await sql!`insert into author_posts(author_id,title,body,type,created_at)select ${author},'History '||n,'History body','blog','2026-11-05T00:00:00Z'from generate_series(1,31)n`;
 await sql!`insert into reading_sessions(user_id,book_id,pages_read,created_at)select ${reader},${book},1,'2026-11-05T00:00:00Z'from generate_series(1,61)`;
 vi.stubEnv('DATABASE_PROVIDER','railway');vi.stubEnv('DATABASE_URL',url!);vi.stubEnv('DATABASE_SSL','false');
 try{const history=await import('@/lib/content-history'),pg=await import('@/lib/db/pg');
 const first=await history.authorPostPage(author,null,null),second=await history.authorPostPage(author,null,first.nextCursor);expect(new Set([...first.posts,...second.posts].map(row=>row.id)).size).toBe(31);
 const sessions=await history.readingSessionPage(reader,book,null),older=await history.readingSessionPage(reader,book,sessions.nextCursor);expect(new Set([...sessions.sessions,...older.sessions].map(row=>row.id)).size).toBe(61);expect((await history.readingSessionPage(author,book,null)).sessions).toHaveLength(0);
 await sql!`update users set profile_visibility='followers_only'where id=${author}`;await expect(history.authorPostPage(author,null,null)).rejects.toThrow('Author unavailable');
 await pg.getSql().end();}finally{vi.unstubAllEnvs();}
});
