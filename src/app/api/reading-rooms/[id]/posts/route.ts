import {contentIntent,ContentIntentError} from '@/lib/content-intents';
import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getRoomPosts,getRoomCount,decodeRoomCursor,ReadingRoomError} from '@/lib/reading-rooms';
export const dynamic='force-dynamic';
const schema=z.object({content:z.string().trim().min(1).max(2000),milestone_id:z.string().uuid().nullable().optional()});
export async function GET(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const query=new URL(request.url).searchParams,milestone=query.get('milestone')??'all',cursor=query.get('cursor');
  if(!z.string().uuid().safeParse(params.id).success||!['all','general'].includes(milestone)&&!z.string().uuid().safeParse(milestone).success)return NextResponse.json({error:'Invalid discussion'},{status:400});
  try{decodeRoomCursor(cursor,user.id,'posts.'+params.id+'.'+milestone);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json(await getRoomPosts(user.id,params.id,milestone,cursor),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:'Discussion unavailable'},{status:error instanceof ReadingRoomError?error.status:503});}
}
export async function POST(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid room'},{status:400});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid post'},{status:422});
  const {data:profile,error}=await createServiceClient().from('users').select('id,username,display_name,avatar_url').eq('id',user.id).eq('is_banned',false).is('deleted_at',null).maybeSingle();
  if(error)return NextResponse.json({error:'Profile unavailable'},{status:503});if(!profile)return NextResponse.json({error:'Account unavailable'},{status:403});
  try{const intent=await contentIntent(request,user.id,'reading_room_posts',{room_id:params.id,user_id:user.id,content:parsed.data.content,milestone_id:parsed.data.milestone_id??null}),post=await intent.insert(),milestonePostCount=post.milestone_id?await getRoomCount(user.id,params.id,'posts',String(post.milestone_id)):null;return NextResponse.json({post:{...post,users:profile},milestonePostCount,actorId:user.id,roomId:params.id},{status:201});}
  catch(error){return NextResponse.json({error:'Post unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
