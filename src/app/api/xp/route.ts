import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkRouteRateLimit} from '@/lib/rate-limit';

export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('daily_login')}).strict(),
  z.object({action:z.literal('finish_book'),bookId:z.string().uuid()}).strict(),
]);
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid reading reward'},{status:400});
  const {data,error}=await createServiceClient().rpc('claim_reading_reward' as never,{p_user_id:user.id,p_action:parsed.data.action,p_book_id:parsed.data.action==='finish_book'?parsed.data.bookId:null} as never);
  const reward=z.object({xp:z.number().int().nonnegative(),awarded:z.number().int().nonnegative()}).safeParse(data);
  if(error||!reward.success)return NextResponse.json({error:'Reward unavailable'},{status:503});
  return NextResponse.json({xp_awarded:reward.data.awarded,new_total:reward.data.xp});
}
