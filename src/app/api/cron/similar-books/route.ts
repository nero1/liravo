import {cron} from '@/lib/cron';
import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
async function run(request:Request){
 const service=createServiceClient(),deadline=Date.now()+20000;let total=0,scanned=0,complete=false;
 do{
  request.signal.throwIfAborted();
  const {data,error}=await service.rpc('compute_similar_books_batch' as never);
  const receipt=data as {processed?:number;scanned?:number;complete?:boolean}|null;
  if(error||!receipt||!Number.isSafeInteger(receipt.processed)||!Number.isSafeInteger(receipt.scanned)||typeof receipt.complete!=='boolean')throw new Error('Job batch unavailable');
  total+=receipt.processed!;scanned+=receipt.scanned!;complete=receipt.complete;
  if(!receipt.scanned&&!complete)throw new Error('Job cursor did not advance');
 }while(!complete&&Date.now()<deadline);
 return NextResponse.json({processed:total,scanned,complete});
}
export const GET=cron('similar-books',run);
export const POST=GET;
export const maxDuration=60;
