import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getLeaderboard,LeaderboardError} from '@/lib/leaderboards';
export const dynamic='force-dynamic';
const query=z.object({type:z.enum(['global','national','friends','reviewers']).default('global'),period:z.enum(['weekly','monthly','alltime']).default('weekly'),locale:z.enum(['en','fr','de']).optional()});
export async function GET(request:NextRequest){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const search=new URL(request.url).searchParams,parsed=query.safeParse({type:search.get('type')??undefined,period:search.get('period')??undefined,locale:search.get('locale')??undefined});if(!parsed.success)return NextResponse.json({error:'Invalid leaderboard'},{status:400});
  const {type,period,locale}=parsed.data,country=locale?({en:'US',fr:'FR',de:'DE'} as const)[locale]:null;
  try{return NextResponse.json(await getLeaderboard(user.id,type,period,country),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Leaderboard unavailable'},{status:error instanceof LeaderboardError?error.status:503});}
}
