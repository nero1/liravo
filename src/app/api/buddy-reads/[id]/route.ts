import {getBuddyDetail} from '@/lib/buddy-reads';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
export const dynamic='force-dynamic';
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid buddy read'},{status:400});
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  try{const detail=await getBuddyDetail(user.id,params.id);return detail?NextResponse.json(detail,{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'Not found'},{status:404});}
  catch{return NextResponse.json({error:'Buddy read unavailable'},{status:503});}
}
