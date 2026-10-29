import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getArcApplications,decodeApplicationCursor,applicationStatus,ArcError} from '@/lib/arcs';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const url=new URL(request.url),status=applicationStatus.safeParse(url.searchParams.get('status')??'all'),cursor=url.searchParams.get('cursor');
  if(!z.string().uuid().safeParse(params.id).success||!status.success)return NextResponse.json({error:'Invalid ARC or status'},{status:400});
  try{decodeApplicationCursor(cursor,params.id,status.data);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{const snapshot=await getArcApplications(user.id,params.id,status.data,cursor);return snapshot?NextResponse.json(snapshot,{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'ARC not found'},{status:404});}
  catch(error){return NextResponse.json({error:'ARC applications unavailable'},{status:error instanceof ArcError?error.status:503});}
}
