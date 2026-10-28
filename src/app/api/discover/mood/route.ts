import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {canonicalMood,getMoodBooks,MoodCursorError} from '@/services/discovery';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  if(!await getCurrentUser())return NextResponse.json({error:'Unauthorized'},{status:401});
  const search=new URL(request.url).searchParams,mood=canonicalMood(search.get('mood')??''),limit=Number(search.get('limit')??30);
  if(!mood)return NextResponse.json({error:'Invalid mood'},{status:400});
  try{return NextResponse.json(await getMoodBooks(mood,search.get('cursor'),limit));}
  catch(error){return NextResponse.json({error:'Mood discovery unavailable'},{status:error instanceof MoodCursorError?400:503});}
}
