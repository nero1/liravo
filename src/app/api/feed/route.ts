import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {FeedCursorError,getSocialFeed} from '@/lib/social-feed';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await getSocialFeed(user.id,new URL(request.url).searchParams.get('cursor')));}catch(error){return NextResponse.json({error:error instanceof FeedCursorError?'Invalid feed cursor':'Feed unavailable'},{status:error instanceof FeedCursorError?400:503});}
}
