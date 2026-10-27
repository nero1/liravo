import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/moderation';
import {createServiceClient} from '@/lib/supabase/server';
import {seedItem} from '../../../../../../scripts/seed/items';
import type {SeedClient} from '../../../../../../scripts/seed/client';

export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  try{const result=await seedItem(createServiceClient() as unknown as SeedClient,'editors','system',{},guard.userId);return NextResponse.json({id:result.id,inserted:result.created?1:0,skipped:result.created?0:1,repaired:0,errors:[]},{status:result.created?201:200});}
  catch{return NextResponse.json({error:'Editors seed unavailable; verify the reserved account identity'},{status:503});}
}
