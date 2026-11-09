import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const period=new URL(request.url).searchParams.get('period')??'monthly';
 if(!['weekly','monthly','all_time'].includes(period))return NextResponse.json({error:'Invalid period'},{status:400});
 const viewer=await getCurrentUser(),{data,error}=await createServiceClient().rpc('writing_prompt_leaderboard',{p_period:period,p_viewer:viewer?.id??null});
 if(error||!Array.isArray(data))return NextResponse.json({error:'Leaderboard unavailable'},{status:503});
 return NextResponse.json({leaderboard:data,period},{headers:{'Cache-Control':'private, no-store'}});
}
