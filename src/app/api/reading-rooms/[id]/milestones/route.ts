import {contentIntent,ContentIntentError} from '@/lib/content-intents';
import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getRoomMilestones,getRoomCount,getReadingRoom,decodeRoomCursor,ReadingRoomError} from '@/lib/reading-rooms';
export const dynamic='force-dynamic';
const schema=z.object({title:z.string().trim().min(1).max(200),unlock_date:z.string().datetime({offset:true})});
export async function GET(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid room'},{status:400});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const cursor=new URL(request.url).searchParams.get('cursor');try{decodeRoomCursor(cursor,user.id,'milestones.'+params.id);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json(await getRoomMilestones(user.id,params.id,cursor),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:'Milestones unavailable'},{status:error instanceof ReadingRoomError?error.status:503});}
}
export async function POST(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid room'},{status:400});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid milestone'},{status:422});
  const {data:profile,error}=await createServiceClient().from('users').select('id').eq('id',user.id).eq('is_banned',false).is('deleted_at',null).maybeSingle();
  if(error)return NextResponse.json({error:'Profile unavailable'},{status:503});if(!profile)return NextResponse.json({error:'Account unavailable'},{status:403});
  try{const intent=await contentIntent(request,user.id,'reading_room_milestones',{room_id:params.id,title:parsed.data.title,unlock_date:parsed.data.unlock_date}),milestone=await intent.insert(),milestoneTotal=await getRoomCount(user.id,params.id,'milestones');return NextResponse.json({milestoneTotal,milestone:{...milestone,is_unlocked:new Date(String(milestone.unlock_date)).getTime()<=Date.now(),post_count:0},actorId:user.id,roomId:params.id},{status:201});}
  catch(error){return NextResponse.json({error:'Milestone unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
export async function DELETE(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const milestoneId=new URL(request.url).searchParams.get('milestone_id');if(!z.string().uuid().safeParse(params.id).success||!z.string().uuid().safeParse(milestoneId).success)return NextResponse.json({error:'Invalid milestone'},{status:400});
  try{const detail=await getReadingRoom(user.id,params.id);if(detail.room.created_by!==user.id)return NextResponse.json({error:'Creator access required'},{status:403});const {error}=await createServiceClient().from('reading_room_milestones').delete().eq('id',milestoneId!).eq('room_id',params.id);if(error)throw Error();return NextResponse.json({deleted:true,milestoneTotal:await getRoomCount(user.id,params.id,'milestones'),actorId:user.id,roomId:params.id,milestoneId});}
  catch(error){return NextResponse.json({error:'Milestone deletion unavailable'},{status:error instanceof ReadingRoomError?error.status:503});}
}
