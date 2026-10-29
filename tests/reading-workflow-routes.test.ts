import {beforeEach,expect,it,vi} from 'vitest';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {POST} from '@/app/api/import/goodreads/route';
import {PATCH} from '@/app/api/buddy-reads/[id]/update/route';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn(async()=>true)}));
const rpc=vi.fn();const user='00000000-0000-4000-8000-000000001001',room='00000000-0000-4000-8000-000000001002';
const csv='Book Id,Title,Author,Exclusive Shelf\n92001,One,Author,to-read';
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:user} as never);vi.mocked(createServiceClient).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:{imported:1,skipped:0},error:null});});
it('accepts native JSON and web multipart imports with the same durable file identity',async()=>{
  const native=await POST(new Request('https://app.test/api/import/goodreads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csv})}));
  expect(native.status).toBe(200);const nativeArgs=rpc.mock.calls[0][1];
  const form=new FormData();form.append('file',new File([csv],'library.csv',{type:'text/csv'}));
  const web=await POST(new Request('https://app.test/api/import/goodreads',{method:'POST',body:form}));
  expect(web.status).toBe(200);expect(rpc.mock.calls[1][1]).toEqual(nativeArgs);
  expect(nativeArgs).toMatchObject({p_user_id:user,p_rows:[{book:{goodreads_id:'92001'}}]});
});
it('bounds chunked bodies without trusting content length and rejects malformed CSV before database writes',async()=>{
  let cancelled=false;
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1_000_000));},cancel(){cancelled=true;}});
  const tooLarge=await POST(new Request('https://app.test/api/import/goodreads',{method:'POST',headers:{'Content-Type':'application/json'},body,duplex:'half'} as RequestInit));
  expect(tooLarge.status).toBe(413);expect(cancelled).toBe(true);expect(rpc).not.toHaveBeenCalled();
  const invalid=await POST(new Request('https://app.test/api/import/goodreads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csv:'Title,Author\n"unclosed'})}));
  expect(invalid.status).toBe(422);expect(rpc).not.toHaveBeenCalled();
});
it('reports import failures without fabricated counts and preserves conflicts',async()=>{
  for(const [code,status] of [['P1001',409],['XX000',503]] as const){rpc.mockResolvedValue({data:null,error:{code,message:'Unavailable'}});const response=await POST(new Request('https://app.test/api/import/goodreads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csv})}));expect(response.status).toBe(status);expect(await response.json()).not.toHaveProperty('imported');}
});
it('rejects invalid buddy updates and submits chapter/note together under the authenticated actor',async()=>{
  const request=(payload:unknown,key='buddy-route-intent')=>new Request('https://app.test/api/buddy-reads/'+room+'/update',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
  for(const payload of [{},{current_chapter:0},{note:' '},{current_chapter:1,created_by:user}])expect((await PATCH(request(payload),{params:{id:room}})).status).toBe(422);
  expect(rpc).not.toHaveBeenCalled();rpc.mockResolvedValue({data:{updated:true},error:null});
  expect((await PATCH(request({current_chapter:5,note:' Shared note '}),{params:{id:room}})).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('update_buddy_progress',{p_actor_id:user,p_room_id:room,p_key:'buddy-route-intent',p_payload:{current_chapter:5,note:'Shared note'}});
});

it('rejects buddy progress from a changed account before performing database work',async()=>{
  const response=await PATCH(new Request('https://app.test/api/buddy-reads/'+room+'/update',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'buddy-owned-intent','X-Liravo-Actor':room},body:JSON.stringify({current_chapter:2})}),{params:{id:room}});expect(response.status).toBe(409);expect(rpc).not.toHaveBeenCalled();
});
