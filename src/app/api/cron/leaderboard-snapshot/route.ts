import {cron} from '@/lib/cron';
import {NextResponse} from 'next/server';
import {getRedisClient} from '@/lib/redis';
import {getLeaderboard} from '@/lib/leaderboards';
export const dynamic='force-dynamic';
async function run(){
  const snapshot=await getLeaderboard(null,'global','weekly',null,100),week=snapshot.periodStart!.slice(0,10);
  await getRedisClient().set('leaderboard:snapshot:weekly:'+week,JSON.stringify(snapshot),{ex:7*86400});
  return NextResponse.json({snapshot:week,usersSnapshotted:snapshot.leaderboard.length});
}
export const GET=cron('leaderboard-snapshot',run);
export const POST=GET;
export const maxDuration=60;
