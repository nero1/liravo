import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getAuthorAnalytics,getAuthorCatalog} from '@/lib/author-catalog';
export const dynamic='force-dynamic';
export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{const analytics=await getAuthorAnalytics(user.id);if(!analytics)return NextResponse.json({error:'Verified author access required'},{status:403});
    return NextResponse.json({...analytics,...await getAuthorCatalog(user.id)},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Author analytics unavailable'},{status:503});}
}
