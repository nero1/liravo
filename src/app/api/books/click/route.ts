import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {getRequestCorrelationId} from '@/lib/utils';
import {recordMetric} from '@/lib/metrics';
import {buildAffiliateLinks,getAudibleLink} from '@/services/books';

export const dynamic='force-dynamic';
const schema=z.object({bookId:z.string().uuid(),linkId:z.string().regex(/^(worldcat|audible-(us|fr|de)|[a-f0-9-]{36}):[a-f0-9]{64}$/)}).strict();
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');if(!key||key.length<8||key.length>200)return NextResponse.json({error:'Missing/invalid click intent'},{status:400});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const raw=await request.text();if(raw.length>2048)return NextResponse.json({error:'Payload too large'},{status:413});
  let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid book link'},{status:400});
  try{
    const db=createServiceClient(),{data:book,error:bookError}=await db.from('books').select('*').eq('id',parsed.data.bookId).maybeSingle();
    if(bookError)throw new Error('Book lookup unavailable');if(!book)return NextResponse.json({error:'Book unavailable'},{status:404});
    const {data:profile,error:profileError}=await db.from('users').select('country,preferred_locale').eq('id',user.id).single();if(profileError||!profile)throw new Error('Profile lookup unavailable');
    let link=null,lookupFailed=false;
    try{const country=profile.country?.toUpperCase()??'US',locale=profile.preferred_locale??'en',links=await buildAffiliateLinks(book,country,locale),audio=getAudibleLink(book,locale,country);link=[...links,...(audio?[audio]:[])].find(value=>value.linkId===parsed.data.linkId)??null;}catch{lookupFailed=true;}
    const {data,error}=await db.rpc('record_book_link_click',{p_user_id:user.id,p_book_id:parsed.data.bookId,p_link_id:parsed.data.linkId,p_key:key,p_link:link?{...link}:null});
    if(error){const status=error.code==='P1005'&&lookupFailed?503:({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503;if(status===503)throw new Error('Click storage unavailable');return NextResponse.json({error:'Book link unavailable'},{status});}
    const result=z.object({ok:z.literal(true),clickId:z.string().uuid()}).safeParse(data);if(!result.success)throw new Error('Invalid click receipt');return NextResponse.json(result.data);
  }catch{recordMetric('book_click_error',{correlationId:getRequestCorrelationId(request),userId:user.id},'warn');return NextResponse.json({error:'Click recording unavailable'},{status:503});}
}
