import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createServiceClient} from '@/lib/supabase/server';
import {getStorageProvider} from '@/lib/storage/provider';
import {isDirectPostgres} from '@/lib/db/provider';
import {recordMetric} from '@/lib/metrics';
import {AVATAR_MAX_BYTES} from '@/constants/config';

export class AvatarError extends Error{constructor(public readonly status:number,public readonly code:string){super(code);}}
export async function avatarFile(request:Request){
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new AvatarError(415,'INVALID_AVATAR_FORM');
  const limit=AVATAR_MAX_BYTES+64*1024,reader=request.body?.getReader();if(!reader)throw new AvatarError(400,'INVALID_AVATAR_FORM');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new AvatarError(413,'AVATAR_TOO_LARGE');}chunks.push(value);}}
  finally{reader.releaseLock();}
  let form:FormData;try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}catch{throw new AvatarError(400,'INVALID_AVATAR_FORM');}
  const file=form.get('file');if(!(file instanceof File)||form.getAll('file').length!==1)throw new AvatarError(400,'INVALID_AVATAR_FILE');
  if(file.size>AVATAR_MAX_BYTES)throw new AvatarError(413,'AVATAR_TOO_LARGE');return file;
}
export async function normalizeAvatar(file:File){
  const input=Buffer.from(await file.arrayBuffer());
  const type=input.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':input.subarray(0,4).toString()==='RIFF'&&input.subarray(8,12).toString()==='WEBP'?'image/webp':null;
  if(!type||file.type!==type)throw new AvatarError(415,'INVALID_AVATAR_IMAGE');
  try{
    const image=sharp(input,{limitInputPixels:25_000_000,failOn:'warning'}).timeout({seconds:4}),metadata=await image.metadata();
    if(!metadata.width||!metadata.height||(metadata.pages??1)!==1)throw new AvatarError(415,'INVALID_AVATAR_IMAGE');
    const body=await image.rotate().resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    return {body,hash:createHash('sha256').update(body).digest('hex')};
  }catch(error){if(error instanceof AvatarError)throw error;throw new AvatarError(415,'INVALID_AVATAR_IMAGE');}
}
export function avatarStorage(){
  const direct=isDirectPostgres(),service=createServiceClient();
  return {backend:direct?'s3':'supabase',bucket:direct?(process.env.S3_BUCKET??'avatars'):'avatars',storage:getStorageProvider(direct?undefined:bucket=>service.storage.from(bucket))};
}
export async function storageDeadline<T>(operation:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Storage deadline exceeded')),6000);})]);}finally{clearTimeout(timer);}
}
export async function cleanupAvatarUploads(){
  const {backend,storage}=avatarStorage(),service=createServiceClient();
  const {data,error}=await service.rpc('claim_avatar_cleanup',{p_backend:backend,p_limit:5});if(error)throw new Error('Avatar cleanup unavailable');
  const uploads=(data??[]) as {id:string;claim_token:string;bucket:string;path:string}[];let processed=0,failed=0;
  for(const upload of uploads){
    let success=false;
    try{const removed=await storageDeadline(storage.remove(upload.bucket,[upload.path]));success=!removed.error;}catch{}
    const receipt=await service.rpc('finish_avatar_cleanup',{p_id:upload.id,p_claim:upload.claim_token,p_success:success});
    if(success&&!receipt.error&&receipt.data===true)processed++;else failed++;
  }
  recordMetric('avatar_cleanup_run',{processed,failed,scanned:uploads.length},failed?'error':'info');return {processed,failed,scanned:uploads.length};
}
