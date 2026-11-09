import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {googlePlayManagementUrl} from '@/lib/google-play';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  try{const {data,error}=await createServiceClient().rpc('premium_status_snapshot',{p_user:user.id});
  if(error||!data)return NextResponse.json({error:'Premium status unavailable'},{status:error?.code==='P1003'?403:503});
  return NextResponse.json({...data as object,actorId:user.id,googlePlayManageUrl:googlePlayManagementUrl()},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Premium status unavailable'},{status:503});}
}
