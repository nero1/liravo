import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {checkCriticalRateLimit,checkRouteRateLimit} from '@/lib/rate-limit';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {exportJobSchema,exportPageSchema,exportFragment,readExportCursor,signExportCursor} from '@/lib/account-export';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(req.headers.has('X-Liravo-Actor')&&req.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409,headers});
 if(!(await checkCriticalRateLimit('export:start:'+user.id)).allowed)return NextResponse.json({error:'Too many requests'},{status:429,headers:{...headers,'Retry-After':'60'}});
 const reader=req.body?.getReader();let body='';if(reader){const decoder=new TextDecoder();try{let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>100){await reader.cancel();return NextResponse.json({error:'Invalid export request'},{status:413,headers});}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}}
 let format:'json'|'csv';try{format=z.object({format:z.enum(['json','csv'])}).parse(JSON.parse(body)).format;}catch{return NextResponse.json({error:'Invalid export format'},{status:400,headers});}
 const key=req.headers.get('Idempotency-Key')??req.headers.get('X-Idempotency-Key');if(!key||!/^[\w-]{8,200}$/.test(key))return NextResponse.json({error:'Idempotency key required'},{status:400,headers});
 const {data,error}=await createServiceClient().rpc('start_account_export',{p_user:user.id,p_format:format,p_key:key});
 const result=exportJobSchema.safeParse(data);if(error||!result.success||result.data.actorId!==user.id)return NextResponse.json({error:'Export unavailable'},{status:503,headers});
 const job=result.data,cursor=signExportCursor({user:user.id,job:job.id,dataset:0,key:null,first:true,expires:Date.parse(job.expiresAt)});
 return NextResponse.json({actorId:user.id,jobId:job.id,cursor,expiresAt:job.expiresAt,filename:'liravo-export-'+job.createdAt.slice(0,10)+'.'+job.format},{headers});
}
export async function GET(req:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(!await checkRouteRateLimit('export:page:'+user.id,'exports'))return NextResponse.json({error:'Too many requests'},{status:429,headers:{...headers,'Retry-After':'60'}});
 let cursor;try{cursor=readExportCursor(new URL(req.url).searchParams.get('cursor')??'',user.id);}catch{return NextResponse.json({error:'Export expired or unavailable'},{status:400,headers});}
 const service=createServiceClient(),{data:row,error:lookupError}=await service.from('account_export_jobs').select('id,user_id,format,created_at,expires_at,datasets').eq('id',cursor.job).eq('user_id',user.id).single();
 if(lookupError||!row)return NextResponse.json({error:'Export expired or unavailable'},{status:410,headers});
 const parsed=exportJobSchema.safeParse({id:row.id,actorId:row.user_id,format:row.format,createdAt:row.created_at,expiresAt:row.expires_at,datasets:row.datasets});
 if(!parsed.success||!parsed.data.datasets[cursor.dataset])return NextResponse.json({error:'Invalid export'},{status:503,headers});
 const {data,error}=await service.rpc('account_export_page',{p_user:user.id,p_job:cursor.job,p_dataset:parsed.data.datasets[cursor.dataset].dataset,p_cursor:cursor.key,p_limit:500});
 const page=exportPageSchema.safeParse(data);if(error||!page.success)return NextResponse.json({error:'Export page unavailable'},{status:error?.code==='P1005'?410:503,headers});
 try{return NextResponse.json(exportFragment(parsed.data,cursor,page.data),{headers});}catch{return NextResponse.json({error:'Invalid export page'},{status:503,headers});}
}
