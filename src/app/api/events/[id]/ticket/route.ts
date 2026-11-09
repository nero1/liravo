import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { getClientIp,getRequestCorrelationId } from '@/lib/utils';
import { createTicketCheckout,validateCheckoutUrl } from '@/lib/payment-providers';

export const dynamic='force-dynamic';
export const maxDuration=60;
const ticketSchema=z.object({id:z.string().uuid(),user_id:z.string().uuid(),amount_paid:z.coerce.string(),currency:z.enum(['USD','NGN','EUR']),provider:z.enum(['paystack','dodopayments']),status:z.string(),reserved_until:z.string().nullable(),checkout_url:z.string().nullable()});
export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid event'},{status:400});
  if(!(await checkMoneyRateLimit(user.id,getClientIp(request))).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const form=request.headers.get('content-type')?.includes('application/x-www-form-urlencoded');
  const body=form?await request.formData().catch(()=>null):null;
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key')??body?.get('_idempotency');
  if(typeof key!=='string'||key.length<8||key.length>200)return NextResponse.json({error:'Missing ticket intent'},{status:400});
  const fail=(status:number)=>form?new Response(null,{status:303,headers:{Location:`/events/${params.id}?error=ticket`}}):NextResponse.json({error:'Ticket checkout unavailable'},{status});
  const db=createServiceClient();
  const {data,error}=await db.rpc('reserve_event_ticket',{p_user_id:user.id,p_event_id:params.id,p_key:key,p_correlation_id:getRequestCorrelationId(request)});
  if(error)return fail(({P1001:409,P1003:403,P1004:409,P1005:404} as Record<string,number>)[error.code]??503);
  const parsed=ticketSchema.safeParse(data);if(!parsed.success)return fail(503);
  const ticket=parsed.data,statusUrl=`/tickets/${ticket.id}`;
  if(ticket.user_id!==user.id)return fail(503);
  const status=ticket.status==='pending'&&ticket.reserved_until&&Date.parse(ticket.reserved_until)<=Date.now()?'expired':ticket.status;
  let redirectUrl=statusUrl;
  if(status==='pending'&&ticket.reserved_until){
    try{
      if(ticket.checkout_url)redirectUrl=validateCheckoutUrl(ticket.provider,ticket.checkout_url);
      else{
        const checkout=await createTicketCheckout(ticket,user.email);
        const {error:saveError}=await db.rpc('record_ticket_checkout',{p_user_id:user.id,p_ticket_id:ticket.id,p_checkout_id:checkout.checkoutId,p_url:checkout.url});
        if(saveError)throw new Error('Checkout persistence unavailable');
        redirectUrl=checkout.url;
      }
    }catch{return fail(502);}
  }
  if(form)return new Response(null,{status:303,headers:{Location:redirectUrl}});
  return NextResponse.json({ticketId:ticket.id,status,redirectUrl,statusUrl},{headers:{'Cache-Control':'private, no-store'}});
}
