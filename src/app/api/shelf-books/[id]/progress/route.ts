import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function PATCH(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid shelf entry'},{status:400});
  const parsed=z.object({progress_pages:z.number().int().min(0).max(100000).optional(),progress_percent:z.number().min(0).max(100).optional()}).refine(body=>body.progress_pages!==undefined||body.progress_percent!==undefined).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid progress'},{status:422});
  const {data,error}=await createServiceClient().rpc('update_shelf_progress',{p_user_id:user.id,p_entry_id:params.id,p_pages:parsed.data.progress_pages??null,p_percent:parsed.data.progress_percent??null});
  if(error)return NextResponse.json({error:'Progress update unavailable'},{status:({P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json(data);
}
