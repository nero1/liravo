import {awardXP} from '@/services/xp';
import {contentIntent,ContentIntentError} from '@/lib/content-intents';
import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
export const dynamic='force-dynamic';
const schema=z.object({answer:z.string().trim().min(20).max(5000)}).strict();
export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid question'},{status:400});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid answer'},{status:422});
  const {data:profile,error}=await createServiceClient().from('users').select('id,username,display_name,avatar_url,is_verified_author,xp').eq('id',user.id).is('deleted_at',null).eq('is_banned',false).maybeSingle();
  if(error)return NextResponse.json({error:'Writer profile unavailable'},{status:503});
  if(!profile||(!profile.is_verified_author&&profile.xp<=1000))return NextResponse.json({error:'Verified author or more than 1000 XP required'},{status:403});
  try{const intent=await contentIntent(request,user.id,'ask_writer_answers',{question_id:params.id,answer:parsed.data.answer}),answer=await intent.insert();await awardXP(user.id,10,'answer_question',`answer:${answer.id}`);return NextResponse.json({answer:{...answer,author:{id:profile.id,username:profile.username,display_name:profile.display_name,avatar_url:profile.avatar_url,is_verified_author:profile.is_verified_author}},actorId:user.id},{status:201,headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Answer unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
