import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import postgres from 'postgres';
import {readFileSync} from 'node:fs';
const url=process.env.SCALE_TEST_DATABASE_URL;
if(url&&!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Database budgets require isolated loopback PostgreSQL');
const fixture=url?postgres(url,{max:2,ssl:false,onnotice:()=>{}}):null;
let db:typeof import('@/lib/db/pg');
beforeAll(async()=>{
 if(!fixture)return;const [{count}]=await fixture`select count(*)::int count from pg_tables where schemaname='public'`;
 if(!count){const connection=await fixture.reserve();try{await connection.unsafe(readFileSync('supabase/migrations/001_schema.sql','utf8')).simple();}finally{connection.release();}}
 vi.stubEnv('DATABASE_URL',url!);vi.stubEnv('DATABASE_SSL','false');vi.stubEnv('DATABASE_POOL_MAX','1');vi.stubEnv('DATABASE_QUERY_TIMEOUT_MS','200');vi.stubEnv('DATABASE_LOCK_TIMEOUT_MS','50');vi.stubEnv('DATABASE_QUEUE_TIMEOUT_MS','50');vi.stubEnv('DATABASE_QUEUE_MAX','1');
 db=await import('@/lib/db/pg');
},60000);
afterAll(async()=>{if(fixture){await db.getSql().end();await fixture.end();}vi.unstubAllEnvs();});
const test=it.skipIf(!url);
test('rejects invalid pool settings and cancels a slow statement without replaying it',async()=>{
 vi.stubEnv('DATABASE_POOL_MAX','NaN');expect(()=>db.databaseLimits()).toThrow('DATABASE_POOL_MAX');vi.stubEnv('DATABASE_POOL_MAX','1');
 const started=performance.now();await expect(db.withDatabaseOperation(()=>db.executeQuery(db.getSql()`select pg_sleep(2)`))).rejects.toMatchObject({code:'57014'});expect(performance.now()-started).toBeLessThan(1500);
 expect((await db.withDatabaseOperation(()=>db.executeQuery(db.getSql()`select 1 value`)))[0].value).toBe(1);
});
test('bounds queued callers and recovers immediately after pressure clears',async()=>{
 const outcomes=await Promise.allSettled(Array.from({length:6},()=>db.withDatabaseOperation(()=>db.executeQuery(db.getSql()`select pg_sleep(0.15)`))));
 expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(result=>result.status==='rejected').every(result=>result.reason.message.includes('Database queue'))).toBe(true);
 expect((await db.withDatabaseOperation(()=>db.executeQuery(db.getSql()`select 1 value`)))[0].value).toBe(1);
});
test('fails bounded lock contention and does not leave a poisoned connection',async()=>{
 let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const holder=fixture!.begin(async tx=>{await tx`update feature_flags set enabled=enabled where name='creator_tips'`;entered();await gate;});await ready;
 try{const started=performance.now();await expect(db.withDatabaseOperation(()=>db.executeQuery(db.getSql()`update feature_flags set enabled=enabled where name='creator_tips'`))).rejects.toMatchObject({code:'55P03'});expect(performance.now()-started).toBeLessThan(1000);}finally{release();await holder;}
 expect((await db.withDatabaseOperation(()=>db.executeQuery(db.getSql()`select 1 value`)))[0].value).toBe(1);
});
