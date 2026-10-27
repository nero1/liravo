import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
import { requireReadingRoomAccess,ContentIntentError } from '@/lib/content-intents';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid room'},{status:400});
  try{await requireReadingRoomAccess(params.id,user.id);}catch(error){return NextResponse.json({error:'Room unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
  const db=createServiceClient();
  const [room,member]=await Promise.all([
    db.from('reading_rooms').select('id,name,book_id,created_by,is_active,is_public,created_at').eq('id',params.id).maybeSingle(),
    db.from('room_participants').select('user_id').eq('room_id',params.id).eq('user_id',user.id).maybeSingle(),
  ]);
  if(room.error||member.error)return NextResponse.json({error:'Room unavailable'},{status:503});
  if(!room.data)return NextResponse.json({error:'Room not found'},{status:404});
  return NextResponse.json({room:{...room.data,is_member:!!member.data||room.data.created_by===user.id}});
}
