import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const probe=async<T>(operation:()=>PromiseLike<T>):Promise<T>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([Promise.resolve().then(operation),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Probe timeout')),3000);})]);}finally{clearTimeout(timer);}
  };
  const timestamp = new Date().toISOString();
  let databaseStatus: 'ok' | 'error' = 'ok';
  try {
    const { error } = await probe(()=>createServiceClient().from('feature_flags').select('name').limit(1));
    if (error) databaseStatus = 'error';
  } catch { databaseStatus = 'error'; }

  let redisStatus: 'ok' | 'error' = 'ok';
  try {
    const redis = getRedisClient();
    const testKey = `health_check:${crypto.randomUUID()}`;
    await probe(async()=>{await redis.set(testKey, '1', { ex: 10 });if(await redis.get(testKey)!=='1')throw new Error('Probe failed');await redis.del(testKey);});
  } catch { redisStatus = 'error'; }

  const healthy=databaseStatus==='ok'&&redisStatus==='ok';
  return NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    timestamp, version: '1.0.0', services: { database: databaseStatus, redis: redisStatus },
  },{status:healthy?200:503,headers:{'Cache-Control':'no-store'}});
}
