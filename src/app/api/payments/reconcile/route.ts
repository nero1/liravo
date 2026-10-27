import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { getRequestCorrelationId } from '@/lib/utils';
import { drainCheckoutReconciliation } from '@/lib/checkout-reconciliation';

export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const form=request.headers.get('content-type')?.includes('application/x-www-form-urlencoded');
  let returnPath='/premium?payment=pending';
  if(form){const body=await request.formData().catch(()=>null);const target=body?.get('_return');if(typeof target==='string'&&/^\/tips\/[0-9a-f-]{36}$/.test(target))returnPath=target;}
  try{
    const result=await drainCheckoutReconciliation(getRequestCorrelationId(request),user.id);
    if(form)return new Response(null,{status:303,headers:{Location:returnPath+(result.failed?(returnPath.includes('?')?'&':'?')+'verification=unavailable':'')}});
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    if(form)return new Response(null,{status:303,headers:{Location:returnPath+(returnPath.includes('?')?'&':'?')+'verification=unavailable'}});
    return NextResponse.json({error:'Payment status verification unavailable'},{status:503});}
}
