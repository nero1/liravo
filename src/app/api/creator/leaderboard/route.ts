import {NextResponse} from 'next/server';
import {getCreatorLeaderboard} from '@/lib/creator-analytics';

export const dynamic='force-dynamic';
export async function GET(){
  try{return NextResponse.json(await getCreatorLeaderboard());}catch{return NextResponse.json({error:'Creator leaderboard unavailable'},{status:503});}
}
