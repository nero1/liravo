import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { readEvent } from '@/services/events';

export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid event'},{status:400});
  try{
    const event=await readEvent(params.id,user.id);
    if(!event)return NextResponse.json({error:'Event not found'},{status:404});
    return NextResponse.json({event},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Event unavailable'},{status:503});}
}
