import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingChallenge,readingCatalogFailure} from '@/lib/reading-discovery';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid challenge'},{status:400});
  try{return NextResponse.json(await getReadingChallenge(user.id,params.id,new URL(request.url).searchParams.get('participantsCursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const result=readingCatalogFailure(error);return NextResponse.json({error:result.error},{status:result.status});}
}
