import {cron} from '@/lib/cron';
import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
async function run(){
 const {data,error}=await createServiceClient().rpc('check_affiliate_health' as never);
 if(error||!data||!['checked','flagged','logged'].every(key=>Number.isSafeInteger((data as Record<string,unknown>)[key])))throw new Error('Affiliate health unavailable');
 return NextResponse.json(data);
}
export const GET=cron('affiliate-health',run);
export const POST=GET;
export const maxDuration=60;
