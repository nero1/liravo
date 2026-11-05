import {expect,it,vi} from 'vitest';
import {withRedisLock} from '@/lib/locks';

it.skipIf(!process.env.CRON_TEST_REDIS_URL)('holds one renewable Redis lease through 128 competing cron starts and releases it after failure',async()=>{
 const url=process.env.CRON_TEST_REDIS_URL!;if(!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!=='/14')throw Error('Cron load test requires isolated loopback Redis database 14');
 vi.stubEnv('REDIS_PROVIDER','ioredis');vi.stubEnv('REDIS_URL',url);let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>entered=resolve),key='load-'+crypto.randomUUID();let active=0;
 const holder=withRedisLock(key,3,async()=>{active++;entered();await gate;active--;return'completed';});
 try{await ready;const started=performance.now(),outcomes=await Promise.all(Array.from({length:128},()=>withRedisLock(key,3,async()=>{throw Error('Overlapping cron task');})));expect(outcomes.every(value=>value===null)).toBe(true);await new Promise(resolve=>setTimeout(resolve,3300));expect(await withRedisLock(key,3,async()=>false)).toBeNull();expect(active).toBe(1);console.log(JSON.stringify({rehearsal:'cron-load',competingStarts:128,durationMs:Math.round(performance.now()-started),active}));}
 finally{release();await holder;vi.unstubAllEnvs();}
 await expect(withRedisLock(key,3,async()=>{throw Error('Fixture task failure');})).rejects.toThrow('Fixture task failure');expect(await withRedisLock(key,3,async()=>true)).toBe(true);
},15_000);
