import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingChallenges,readingCatalogFailure} from '@/lib/reading-discovery';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const query=new URL(request.url).searchParams,scope=query.get('scope')??'active';if(!['active','mine'].includes(scope))return NextResponse.json({error:'Invalid catalog'},{status:400});
  try{return NextResponse.json(await getReadingChallenges(user.id,scope as 'active'|'mine',query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const result=readingCatalogFailure(error);return NextResponse.json({error:result.error},{status:result.status});}
}
