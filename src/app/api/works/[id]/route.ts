import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWorkCatalog} from '@/services/books';
export const dynamic='force-dynamic';
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  if(!(await getCurrentUser()))return NextResponse.json({error:'Unauthorized'},{status:401});
  const cursor=new URL(request.url).searchParams.get('cursor');
  if(!z.string().uuid().safeParse(params.id).success||cursor!==null&&!z.string().uuid().safeParse(cursor).success)return NextResponse.json({error:'Invalid work page'},{status:400});
  try{const catalog=await getWorkCatalog(params.id,cursor);return catalog?NextResponse.json(catalog):NextResponse.json({error:'Work not found'},{status:404});}
  catch{return NextResponse.json({error:'Work catalog unavailable'},{status:503});}
}
