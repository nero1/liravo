import {beforeEach,expect,it,vi} from 'vitest';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {POST} from '@/app/api/import/goodreads/route';
import {POST as writeQuote} from '@/app/api/quotes/route';
import {POST as writeReview} from '@/app/api/books/[id]/reviews/route';
import {POST as requestVerification} from '@/app/api/author/verification-request/route';
import {quotePageNumber,validReadDate,validProofUrl,MAX_QUOTE_PAGE} from '@/lib/content-form-values';
import {hasVisibleText} from '@/lib/sanitize';
import {readingRoomUnlockDate} from '@/lib/reading-room-date';
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

it('parses milestone dates as UTC minutes and rejects calendar rollovers',()=>{
  expect(readingRoomUnlockDate('2024-02-29T12:30')).toBe('2024-02-29T12:30:00.000Z');
  for(const value of ['2026-02-29T12:30','2026-04-31T12:30','2026-10-29T24:00','0000-01-01T00:00','2026-10-29','2026-10-29T12:30:01'])expect(readingRoomUnlockDate(value)).toBeNull();
});

it('validates quote pages without truncation and checks calendar/proof URL input',()=>{
  expect(quotePageNumber(' ')).toBeUndefined();expect(quotePageNumber('42')).toBe(42);for(const page of ['1.5','0','-1','Infinity',String(MAX_QUOTE_PAGE+1)])expect(quotePageNumber(page)).toBeNull();expect(validReadDate('2024-02-29')).toBe(true);expect(validReadDate('2026-02-29')).toBe(false);expect(validProofUrl('https://example.test')).toBe(true);expect(validProofUrl('javascript:alert(1)')).toBe(false);
});
it('rejects invisible sanitized content, overflow pages and malformed JSON before writing',async()=>{
  for(const text of ['<b></b>','<p><br></p>','&nbsp;','&#x200b;'])expect(hasVisibleText(text)).toBe(false);expect(hasVisibleText('<strong>A visible review</strong>')).toBe(true);
  for(const payload of [{book_id:room,content:'<b></b>'},{book_id:room,content:'&nbsp;'},{book_id:room,content:'A quote',page_number:MAX_QUOTE_PAGE+1}])expect((await writeQuote(new Request('https://app.test/quotes',{method:'POST',body:JSON.stringify(payload)}) as never)).status).toBe(400);
  expect((await writeReview(new Request('https://app.test/reviews',{method:'POST',body:JSON.stringify({star_rating:4,body:'<p><br></p>',review_type:'long'})}),{params:{id:room}})).status).toBe(400);
  expect((await writeQuote(new Request('https://app.test/quotes',{method:'POST',body:'{'}) as never)).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it('rejects unsafe author proof links before creating a verification request',async()=>{
  const response=await requestVerification(new Request('https://app.test/verification',{method:'POST',body:JSON.stringify({pen_name:'Writer',book_titles:'Published book',website_url:'javascript:alert(1)'})}));expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
