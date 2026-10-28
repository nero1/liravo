import {expect,it,vi} from 'vitest';
import {GET} from '@/app/api/cron/new-release-alerts/route';
import {sendEmail} from '@/lib/email';
vi.mock('@/lib/cron',()=>({cron:(_name:string,task:()=>Promise<Response>)=>task}));
vi.mock('@/lib/email',()=>({sendEmail:vi.fn(async()=>({ok:true})),buildNewReleaseEmail:()=>({subject:'Fixture',html:'Fixture',text:'Fixture'})}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({from:(table:string)=>{
  const chain={select:()=>chain,eq:()=>chain,gte:()=>chain,not:()=>chain,single:async()=>({data:table==='users'?{display_name:'Author',username:'author'}:{title:'Book'}}),limit:async()=>({data:table==='author_posts'?[{id:'post',author_id:'author',book_id:'book'}]:[
    {user:{email:'allowed@example.test',email_verified:true,is_premium:true,email_digest_enabled:false,notify_new_releases:true}},
    {user:{email:'opted-out@example.test',email_verified:true,is_premium:true,email_digest_enabled:true,notify_new_releases:false}},
    {user:{email:'free@example.test',email_verified:true,is_premium:false,notify_new_releases:true}},
    {user:{email:'unverified@example.test',email_verified:false,is_premium:true,notify_new_releases:true}},
  ]})};return chain;
}})}));
it('uses the independent new-release preference while retaining paid and verified-email gates',async()=>{
  expect((await GET(new Request('https://app.test/api/cron/new-release-alerts'))).status).toBe(200);expect(sendEmail).toHaveBeenCalledTimes(1);expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({to:'allowed@example.test',type:'new_release_alert'}));
});
