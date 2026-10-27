import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { AIProfileError,readTasteProfile,generateTasteProfile } from '@/services/ai-profiles';

export const dynamic='force-dynamic';
function failure(error:unknown){
  return NextResponse.json({error:error instanceof AIProfileError?error.message:'AI generation is unavailable. Please try again later.',code:error instanceof AIProfileError?error.code:'unavailable'},{status:error instanceof AIProfileError?error.status:503});
}
export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await readTasteProfile(user.id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}
}
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!await checkRouteRateLimit(user.id,'ai'))return NextResponse.json({error:'Too many requests'},{status:429});
  const form=request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')||request.headers.get('accept')?.includes('text/html');
  try{
    const result=await generateTasteProfile(user.id);
    if(form)return new Response(null,{status:303,headers:{Location:'/taste-profile'}});
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    if(form)return new Response(null,{status:303,headers:{Location:'/taste-profile?error='+encodeURIComponent(error instanceof AIProfileError?error.code:'unavailable')}});
    return failure(error);
  }
}
