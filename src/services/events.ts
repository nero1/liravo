import { createServiceClient } from '@/lib/supabase/server';
export async function readEvent(id:string,userId?:string){
  const db=createServiceClient();
  const {data:event,error}=await db.from('events').select('id,title,description,event_date,is_paid,ticket_price,currency,organizer_id,book_id,max_attendees,created_at').eq('id',id).maybeSingle();
  if(error)throw new Error('Event unavailable');if(!event)return null;
  const [host,book,ticket,rsvp,count]=await Promise.all([
    db.from('users').select('id,display_name,username').eq('id',event.organizer_id).maybeSingle(),
    event.book_id?db.from('books').select('id,title').eq('id',event.book_id).maybeSingle():Promise.resolve({data:null,error:null}),
    userId?db.from('event_tickets').select('id,status,reserved_until,amount_paid,currency').eq('event_id',id).eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle():Promise.resolve({data:null,error:null}),
    userId?db.from('event_rsvps').select('user_id').eq('event_id',id).eq('user_id',userId).maybeSingle():Promise.resolve({data:null,error:null}),
    event.is_paid?db.from('event_tickets').select('id',{head:true,count:'exact'}).eq('event_id',id).eq('status','confirmed'):db.from('event_rsvps').select('user_id',{head:true,count:'exact'}).eq('event_id',id),
  ]);
  if([host,book,ticket,rsvp,count].some(result=>result.error))throw new Error('Event attendance unavailable');
  return {...event,can_purchase:!!userId&&userId!==event.organizer_id,price:event.ticket_price===null?null:Number(event.ticket_price),host:host.data,book:book.data,ticket:ticket.data?{...ticket.data,status:ticket.data.status==='pending'&&ticket.data.reserved_until&&Date.parse(ticket.data.reserved_until)<=Date.now()?'expired':ticket.data.status}:null,has_rsvp:!!rsvp.data,attendee_count:count.count??0};
}
