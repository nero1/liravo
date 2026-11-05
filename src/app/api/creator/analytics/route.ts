import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getCreatorAnalytics} from '@/lib/creator-analytics';

export const dynamic='force-dynamic';
export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await getCreatorAnalytics(user.id));}catch{return NextResponse.json({error:'Creator analytics unavailable'},{status:503});}
}
