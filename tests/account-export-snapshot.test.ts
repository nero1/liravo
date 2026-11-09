import {afterAll,beforeAll,expect,it}from'vitest';
import postgres from'postgres';
import {exportJobSchema,exportPageSchema,exportFragment,readExportCursor,signExportCursor}from'@/lib/account-export';
const url=process.env.EXPORT_TEST_DATABASE_URL;
const sql=url?postgres(url,{max:4,prepare:false,ssl:false}):null;
let actor:string,other:string,quote:string,book:string,identifier:string;
beforeAll(async()=>{if(!sql)return;actor=crypto.randomUUID();other=crypto.randomUUID();for(const id of[actor,other])await sql`select create_direct_account(${id},${id+'@export.test'},${'ex'+id.replaceAll('-','').slice(0,15)},'Original profile')`;book=(await sql`select store_catalog_book(${sql.json({title:'Export book',author_name:'Fixture author',isbn_13:'9780131103627'})})book`)[0].book.id;quote=(await sql`insert into quotes(user_id,book_id,content)values(${actor},${book},'Original quote')returning id`)[0].id;identifier='105'+actor.replaceAll('-','');await sql`insert into book_edition_identifiers(provider,identifier,book_id)values('goodreads',${identifier},${book})`;const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='currently_reading'`)[0].id;await sql`select set_shelf_membership(${actor},${shelf},${book},true)`;},30000);
afterAll(async()=>{await sql?.end();});
const integration=(name:string,test:()=>Promise<void>,timeout=30000)=>it.skipIf(!sql)(name,test,timeout);
async function start(format='json'){return exportJobSchema.parse((await sql!`select start_account_export(${actor},${format},${crypto.randomUUID()})data`)[0].data);}
async function page(job:string,dataset:string,key:Record<string,string>|null=null,limit=500){return exportPageSchema.parse((await sql!`select account_export_page(${actor},${job},${dataset},${key?sql!.json(key):null},${limit})data`)[0].data);}
integration('exports every category with original values across updates, deletes, inserts, and ownership changes',async()=>{
 const job=await start();expect((await page(job.id,'reading_history')).records[0].data.books).toMatchObject({goodreads_id:identifier});expect((await page(job.id,'book_edition_identifiers')).records.some(record=>record.data.identifier===identifier)).toBe(true);await sql!`delete from book_edition_identifiers where provider='goodreads'and identifier=${identifier}`;expect((await page(job.id,'reading_history')).records[0].data.books).toMatchObject({goodreads_id:identifier});expect(job.datasets.length).toBeGreaterThan(70);
 await sql!`update users set display_name='Edited after snapshot'where id=${actor}`;
 await sql!`update quotes set content='Edited after snapshot',user_id=${other} where id=${quote}`;
 await sql!`insert into quotes(user_id,book_id,content)values(${actor},${book},'Inserted after snapshot')`;
 expect((await page(job.id,'profile')).records[0].data.display_name).toBe('Original profile');
 expect((await page(job.id,'quotes')).records).toEqual([expect.objectContaining({data:expect.objectContaining({id:quote,content:'Original quote',user_id:actor})})]);
 await sql!`delete from quotes where id=${quote}`;expect((await page(job.id,'quotes')).records[0].data.content).toBe('Original quote');
 for(const dataset of job.datasets)expect((await page(job.id,dataset.dataset)).actorId).toBe(actor);
 const profile=(await page(job.id,'profile')).records[0].data;for(const secret of['password_hash','pin_hash','totp_secret','recovery_codes','unsubscribe_token','auth_not_before'])expect(profile).not.toHaveProperty(secret);
 await expect(sql!`select account_export_page(${other},${job.id},'profile',null,10)`).rejects.toMatchObject({code:'P1005'});
});
integration('waits for an in-flight writer before choosing the snapshot boundary',async()=>{
 let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const writer=sql!.begin(async tx=>{await tx`update users set bio='Committed before snapshot'where id=${actor}`;entered();await gate;});await ready;
 let finished=false;const snapshot=start().then(job=>{finished=true;return job;});await new Promise(resolve=>setTimeout(resolve,50));expect(finished).toBe(false);release();await writer;
 const job=await snapshot;expect((await page(job.id,'profile')).records[0].data.bio).toBe('Committed before snapshot');
});
integration('streams more than the function response limit in bounded, replayable pages',async()=>{
 await sql!`insert into quotes(user_id,book_id,content)select ${actor},${book},repeat('x',6000)||n from generate_series(1,850)n`;
 const job=await start();let key:Record<string,string>|null=null,total=0,bytes=0,pages=0;
 do{const result=await page(job.id,'quotes',key);expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(1000000);total+=result.records.length;bytes+=Buffer.byteLength(JSON.stringify(result.records));pages++;if(!result.complete){expect(result.nextKey).not.toBeNull();expect((await page(job.id,'quotes',key)).records).toEqual(result.records);}key=result.nextKey;}while(key);
 expect(total).toBeGreaterThanOrEqual(850);expect(bytes).toBeGreaterThan(4500000);expect(pages).toBeGreaterThan(5);
},30000);
integration('does not turn a nested trigger update of a new row into pre-snapshot history',async()=>{
 const job=await start();
 await sql!.unsafe(`create function public.export_nested_fixture()returns trigger language plpgsql as $$begin if new.content='nested input'then update quotes set content='nested output'where id=new.id;end if;return null;end $$;create trigger a_export_nested_fixture after insert or update on quotes for each row execute function public.export_nested_fixture()`).simple();
 try{const inserted=(await sql!`insert into quotes(user_id,book_id,content)values(${actor},${book},'nested input')returning id`)[0].id;let key:Record<string,string>|null=null;do{const result=await page(job.id,'quotes',key);expect(result.records.some(record=>record.data.id===inserted)).toBe(false);key=result.nextKey;}while(key);}
 finally{await sql!.unsafe('drop trigger a_export_nested_fixture on quotes;drop function public.export_nested_fixture()').simple();}
});
integration('keeps export internals and helpers inaccessible to browser roles',async()=>{for(const role of['anon','authenticated']){for(const table of['account_export_jobs','account_export_versions','account_export_current'])expect((await sql!`select has_table_privilege(${role},${table},'SELECT')allowed`)[0].allowed).toBe(false);for(const fn of['start_account_export(uuid,text,text)','account_export_page(uuid,uuid,text,jsonb,integer)','account_export_record(uuid,text,jsonb)'])expect((await sql!`select has_function_privilege(${role},${fn},'EXECUTE')allowed`)[0].allowed).toBe(false);}});
integration('rejects expired snapshots and removes their jobs in bounded cleanup',async()=>{
 const job=await start();await sql!`update account_export_jobs set expires_at=clock_timestamp()-interval '1 second'where user_id=${actor}`;
 await expect(sql!`select account_export_page(${actor},${job.id},'profile',null,10)`).rejects.toMatchObject({code:'P1005'});
 const cleaned=(await sql!`select cleanup_account_exports(1000)data`)[0].data;expect(cleaned.jobs).toBeGreaterThan(0);expect(cleaned.jobs).toBeLessThanOrEqual(1000);
 expect((await sql!`select count(*)::int count from account_export_jobs where user_id=${actor}`)[0].count).toBe(0);
});
it('binds signed cursors to the account, job and expiration',()=>{process.env.AUTH_ENCRYPTION_KEY=Buffer.alloc(32,5).toString('base64');const cursor={user:crypto.randomUUID(),job:crypto.randomUUID(),dataset:0,key:null,first:true,expires:Date.now()+60000};const encoded=signExportCursor(cursor);expect(readExportCursor(encoded,cursor.user)).toEqual(cursor);expect(()=>readExportCursor(encoded,crypto.randomUUID())).toThrow();expect(()=>readExportCursor(encoded+'x',cursor.user)).toThrow();expect(()=>readExportCursor(signExportCursor({...cursor,expires:Date.now()-1}),cursor.user)).toThrow('Export expired');});
it('produces parseable JSON across dataset and page boundaries',()=>{process.env.AUTH_ENCRYPTION_KEY=Buffer.alloc(32,5).toString('base64');const actorId=crypto.randomUUID(),jobId=crypto.randomUUID(),job={id:jobId,actorId,format:'json'as const,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),datasets:[{dataset:'profile',single:true},{dataset:'quotes',single:false}]};let cursor={user:actorId,job:jobId,dataset:0,key:null as Record<string,string>|null,first:true,expires:Date.parse(job.expiresAt)},text='';for(const part of[{dataset:'profile',records:[{key:{id:actorId},data:{id:actorId}}],complete:true,nextKey:null},{dataset:'quotes',records:[{key:{id:'1'},data:{content:'one'}}],complete:false,nextKey:{id:'1'}},{dataset:'quotes',records:[{key:{id:'2'},data:{content:'two'}}],complete:true,nextKey:null}]){const result=exportFragment(job,cursor,{actorId,jobId,...part});text+=result.text;if(result.nextCursor)cursor=readExportCursor(result.nextCursor,actorId);}expect(JSON.parse(text)).toMatchObject({profile:{id:actorId},quotes:[{content:'one'},{content:'two'}]});});
