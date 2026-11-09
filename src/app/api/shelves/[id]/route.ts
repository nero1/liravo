import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getShelfDetail,ShelfError} from '@/lib/shelf-catalog';
export const dynamic='force-dynamic';
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
 const query=new URL(request.url).searchParams;
 try{return NextResponse.json(await getShelfDetail(user.id,params.id,query.get('cursor'),Number(query.get('limit')??50)),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Shelf unavailable'},{status:error instanceof ShelfError?error.status:503});}
}
