import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {getAuthorQuestions} from '@/lib/author-questions';
import {validReadingGoal,validReadingGoalData} from '@/lib/client/reading-goal';
import {GET,POST} from '@/app/api/author/qa/route';
const owner='00000000-0000-4000-8000-000000000093',author='00000000-0000-4000-8000-000000000094',id='00000000-0000-4000-8000-000000000095';
const state=vi.hoisted(()=>({rpc:vi.fn(),insert:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:state.rpc}),createClient:()=>({from:()=>({select:()=>({eq:()=>({is:()=>({eq:()=>({single:async()=>({data:{is_verified_author:true},error:null})})})})})})})}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>({id:'00000000-0000-4000-8000-000000000093'})}));
vi.mock('@/lib/content-intents',async original=>({...await original<typeof import('@/lib/content-intents')>(),contentIntent:async()=>({insert:state.insert})}));
beforeEach(()=>{vi.clearAllMocks();});
it('pages all answered questions with an author-bound cursor and preserves microsecond precision',async()=>{
 const at='2026-11-04T00:00:00.123456+00:00';state.rpc.mockResolvedValueOnce({data:{qa:Array.from({length:21},()=>({id,answered_at:null,cursor_at:at,author_id:author})),total:45},error:null});const first=await getAuthorQuestions(author);expect(first.qa).toHaveLength(20);expect(first.qa[0]).not.toHaveProperty('cursor_at');expect(first.total).toBe(45);expect(JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString())).toEqual({authorId:author,at,id});
 state.rpc.mockResolvedValueOnce({data:{qa:[],total:45}});await getAuthorQuestions(author,first.nextCursor);expect(state.rpc).toHaveBeenLastCalledWith('author_question_snapshot',{p_author:author,p_at:at,p_id:id,p_limit:20});await expect(getAuthorQuestions(owner,first.nextCursor)).rejects.toMatchObject({status:400});await expect(getAuthorQuestions(author,'malformed')).rejects.toMatchObject({status:400});
});
it('keeps failed question reads distinct from an empty collection',async()=>{state.rpc.mockResolvedValueOnce({error:{code:'XX000'}});expect((await GET(new Request('https://app.test/api/author/qa?author_id='+author))).status).toBe(503);});
it('recovers only the authenticated actor’s receipt and rejects a stale account header',async()=>{
 state.rpc.mockResolvedValueOnce({data:{id,author_id:author,asked_by:owner}});const response=await GET(new Request('https://app.test/api/author/qa?receipt=question-093',{headers:{'X-Liravo-Actor':owner}}));expect(await response.json()).toMatchObject({actorId:owner,authorId:author,qa:{id}});expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(state.rpc).toHaveBeenLastCalledWith('content_creation_receipt_snapshot',{p_user:owner,p_action:'author_qa',p_key:'question-093'});
 expect((await GET(new Request('https://app.test/api/author/qa?receipt=question-093',{headers:{'X-Liravo-Actor':author}}))).status).toBe(409);
});
it('rejects a question that sanitizes below the database minimum before attempting an insert',async()=>{const response=await POST(new NextRequest('https://app.test/api/author/qa',{method:'POST',body:JSON.stringify({author_id:author,question:'<b></b><i></i>'})}));expect(response.status).toBe(422);expect(state.insert).not.toHaveBeenCalled();});
it('validates owned current-year goals and fails closed on unavailable, malformed and foreign progress',()=>{
 const goal={id,user_id:owner,year:2026,target_books:52},data={actorId:owner,goal,progress:{books_read:12,year:2026,percentage:23}};expect(validReadingGoalData(data,owner,2026)).toBe(true);expect(validReadingGoalData({...data,goal:null,progress:{...data.progress,percentage:null}},owner,2026)).toBe(true);
 for(const invalid of[{error:'Unavailable'},{...data,actorId:author},{...data,goal:{...goal,user_id:author}},{...data,progress:{...data.progress,year:2025}},{...data,progress:undefined},{...data,progress:{...data.progress,books_read:-1}}])expect(validReadingGoalData(invalid,owner,2026)).toBe(false);
 for(const target_books of[0,1.5,10001,NaN])expect(validReadingGoal({...goal,target_books},owner,2026)).toBe(false);
});
