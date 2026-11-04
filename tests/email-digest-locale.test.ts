import{expect,it,vi}from'vitest';
import{GET}from'@/app/api/cron/email-digest/route';
import{sendEmail}from'@/lib/email';
vi.mock('@/lib/email',async original=>({...await original<typeof import('@/lib/email')>(),sendEmail:vi.fn(async()=>({ok:true,messageId:'isolated-message'}))}));
vi.mock('@/lib/cron',()=>({cron:(_name:string,run:()=>Promise<Response>)=>run,mapBatches:async(items:unknown[],_size:number,run:(item:unknown)=>Promise<void>)=>{for(const item of items)await run(item);return items.length;}}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({get:async()=>null,del:async()=>{}})}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:async()=>({data:true,error:null}),from:(table:string)=>{const result=table==='users'?{data:[{id:'reader',email:'reader@example.test',display_name:'Lecteur',username:'lecteur',preferred_locale:'fr'}],error:null}:{count:table==='follows'?1:2,error:null};const builder={select:()=>builder,eq:()=>builder,not:()=>builder,order:()=>builder,limit:()=>builder,gte:()=>builder,update:()=>builder,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return builder;}})}));
it('uses the stored language throughout digest template and transport dispatch',async()=>{const response=await GET(new Request('https://app.test/digest'));expect(await response.json()).toMatchObject({sent:1});expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({locale:'fr',subject:'Votre semaine sur Liravo, Lecteur',text:expect.stringContaining('1 nouvel abonné')}));});
