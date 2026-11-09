import {afterAll,beforeAll,expect,it}from'vitest';
import {getPgQueryBuilderFactory}from'@/lib/db/query-builder';
import {getSql}from'@/lib/db/pg';
import type {createServiceClient}from'@/lib/supabase/server';
const url=process.env.EXPORT_TEST_DATABASE_URL,live=it.skipIf(!url),db=getPgQueryBuilderFactory();let actor:string;
beforeAll(async()=>{if(!url)return;process.env.DATABASE_URL=url;process.env.DATABASE_SSL='false';actor=crypto.randomUUID();const result=await db.rpc('create_direct_account',{p_id:actor,p_email:actor+'@orm.test',p_username:'orm'+actor.replaceAll('-','').slice(0,12),p_display_name:'ORM reader'});expect(result.error).toBeNull();});
afterAll(async()=>{if(url)await getSql().end();});
live('uses Drizzle for filtered projections, sorting, exact counts and nested relationships',async()=>{
 const selected=await db.from('users').select('id,display_name').eq('id',actor).single();expect(selected).toMatchObject({data:{id:actor,display_name:'ORM reader'},error:null});
 const shelves=await db.from('shelves').select('id,owner:users!shelves_user_id_fkey(id,display_name)').eq('user_id',actor).order('id').limit(2);expect(shelves.error).toBeNull();expect(shelves.data).toHaveLength(2);expect(shelves.data).toEqual(expect.arrayContaining([expect.objectContaining({owner:{id:actor,display_name:'ORM reader'}})]));
 const count=await db.from('shelves').select('id',{count:'exact',head:true}).eq('user_id',actor);expect(count).toMatchObject({count:3,error:null});
});
live('uses generated composite primary keys for upserts and preserves mutation returns',async()=>{
 const row={user_id:actor,activity_date:'2026-11-09'};expect((await db.from('reading_activity_days').upsert(row).select('*').single()).error).toBeNull();expect((await db.from('reading_activity_days').upsert(row)).error).toBeNull();expect((await db.from('reading_activity_days').select('*').eq('user_id',actor).single()).data).toMatchObject(row);
 const updated=await db.from('users').update({bio:'Changed through Drizzle',genres:['fiction','poetry']}).eq('id',actor).select('id,bio').single();expect(updated).toMatchObject({data:{id:actor,bio:'Changed through Drizzle'},error:null});
 expect((await db.from('users').select('id').eq('id',actor).contains('genres',['poetry'])).data).toHaveLength(1);
 expect((await db.from('reading_activity_days').delete().eq('user_id',actor).select('*')).data).toHaveLength(1);
});
live('rejects unknown tables and columns and unsafe unfiltered mutations',async()=>{
 expect((await db.from('missing_table').select('*')).error).not.toBeNull();expect((await db.from('users').select('missing_column')).error).not.toBeNull();expect((await db.from('users').select('id').eq('missing_column','value')).error).not.toBeNull();expect((await db.from('users').update({bio:'unsafe'})).error).not.toBeNull();
});
void function contracts(client:ReturnType<typeof createServiceClient>){
 // @ts-expect-error Unknown tables must fail compilation.
 client.from('missing_table');
 // @ts-expect-error Unknown filter columns must fail compilation.
 client.from('users').select('id').eq('missing_column','x');
 // @ts-expect-error Unknown RPC names must fail compilation.
 client.rpc('missing_function',{});
 // @ts-expect-error RPC parameter names must match the SQL signature.
 client.rpc('start_account_export',{p_user:'user',p_format:'json',wrong:'key'});
 // @ts-expect-error Invalid enum values must fail compilation.
 client.from('users').update({preferred_locale:'es'});
};
