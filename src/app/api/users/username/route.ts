import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {z} from 'zod';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const value=z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).safeParse(new URL(request.url).searchParams.get('value'));
  if(!value.success)return NextResponse.json({error:'Invalid username'},{status:422});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const {data,error}=await createServiceClient().from('users').select('id').eq('username',value.data).neq('id',user.id).maybeSingle();
  if(error)return NextResponse.json({error:'Username lookup unavailable'},{status:503});
  return NextResponse.json({available:!data},{headers:{'Cache-Control':'private, no-store'}});
}
