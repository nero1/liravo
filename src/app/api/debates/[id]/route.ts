import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingDebate,readingCatalogFailure} from '@/lib/reading-discovery';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid debate'},{status:400});
  try{return NextResponse.json(await getReadingDebate(user.id,params.id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const result=readingCatalogFailure(error);return NextResponse.json({error:result.error},{status:result.status});}
}
