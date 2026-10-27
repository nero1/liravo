import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/moderation';
import {createServiceClient} from '@/lib/supabase/server';
import {seedCollection} from '../../../../../scripts/seed/items';
import type {SeedClient} from '../../../../../scripts/seed/client';

export async function runContentSeed(kind:Parameters<typeof seedCollection>[1]){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  try{
    const result=await seedCollection(createServiceClient() as unknown as SeedClient,kind,guard.userId);
    const {inserted,skipped,repaired,errors,pending}=result;const counts={inserted,skipped,repaired,errors,pending};
    return NextResponse.json({...counts,...(counts.errors.length?{error:'Seed incomplete; fix the reported dependency and retry'}:{})},{status:counts.errors.length?503:200});
  }catch{return NextResponse.json({error:'Seed unavailable'},{status:503});}
}
