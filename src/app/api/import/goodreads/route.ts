import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { GOODREADS_MAX_BYTES,parseGoodreadsImport } from '@/lib/goodreads-import';

export const dynamic = 'force-dynamic';
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  if(Number(request.headers.get('content-length'))>GOODREADS_MAX_BYTES+10000)return NextResponse.json({error:'CSV exceeds 2 MB'},{status:413});
  let csv:string;
  try{
    const reader=request.body?.getReader();if(!reader)throw new Error('Import body required');
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
      if(size>GOODREADS_MAX_BYTES+10000){await reader.cancel();return NextResponse.json({error:'CSV exceeds 2 MB'},{status:413});}
      chunks.push(chunk.value);
    }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const bodyData=new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')??''}});

    if(request.headers.get('content-type')?.includes('application/json')){
      const body=await bodyData.json();if(typeof body?.csv!=='string')throw new Error('CSV required');csv=body.csv;
    }else{
      const file=(await bodyData.formData()).get('file');if(!file||typeof file==='string')throw new Error('CSV file required');
      if(file.size>GOODREADS_MAX_BYTES)return NextResponse.json({error:'CSV exceeds 2 MB'},{status:413});csv=await file.text();
    }
  }catch{return NextResponse.json({error:'Invalid import data'},{status:400});}
  let parsed;
  try{parsed=parseGoodreadsImport(csv);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid CSV'},{status:422});}
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key')??'goodreads:'+createHash('sha256').update(csv).digest('hex');
  if(key.length<8||key.length>200)return NextResponse.json({error:'Invalid import intent'},{status:400});
  const {data,error}=await createServiceClient().rpc('import_goodreads_library_v2' as never,{p_user_id:user.id,p_key:key,p_rows:parsed.rows,p_skipped:parsed.skipped} as never);
  if(error){const status=({P1001:409,P1003:403,P1004:422,P1005:503} as Record<string,number>)[error.code]??503;return NextResponse.json({error:status===503?'Import unavailable; retry the same file':error.message},{status});}
  if(!data||typeof data!=='object')return NextResponse.json({error:'Import result unavailable'},{status:503});
  return NextResponse.json(data);
}
