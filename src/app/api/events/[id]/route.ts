import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid event'},{status:400});
  const db=createServiceClient();
  const {data:event,error}=await db.from('events').select('id,title,description,event_date,is_paid,price:ticket_price,currency,host_id:organizer_id,book_id,max_attendees,created_at').eq('id',params.id).maybeSingle();
  if(error)return NextResponse.json({error:'Event unavailable'},{status:503});
  if(!event)return NextResponse.json({error:'Event not found'},{status:404});
  const {data:rsvp,error:rsvpError}=await db.from('event_rsvps').select('user_id').eq('event_id',params.id).eq('user_id',user.id).maybeSingle();
  if(rsvpError)return NextResponse.json({error:'RSVP unavailable'},{status:503});
  return NextResponse.json({event:{...event,price:event.price===null?null:Number(event.price),has_rsvp:!!rsvp}});
}
