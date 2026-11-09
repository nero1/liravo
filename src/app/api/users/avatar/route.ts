import {NextResponse} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';
import {avatarFile,normalizeAvatar,avatarStorage,storageDeadline,AvatarError} from '@/lib/profile-avatars';

export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!(await checkCriticalRateLimit('avatar:user:'+user.id)).allowed)return NextResponse.json({error:'Too many uploads'},{status:429});
  const ip=getClientIp(request);if(ip!=='unknown'&&!(await checkCriticalRateLimit('avatar:ip:'+ip)).allowed)return NextResponse.json({error:'Too many uploads'},{status:429});
  try{
    const file=await avatarFile(request),{body,hash}=await normalizeAvatar(file),{backend,bucket,storage}=avatarStorage(),service=createServiceClient();
    const staged=await service.rpc('begin_avatar_upload',{p_user_id:user.id,p_hash:hash,p_backend:backend,p_bucket:bucket});
    if(staged.error)return NextResponse.json({error:'AVATAR_UNAVAILABLE'},{status:staged.error.code==='P1001'?409:503});
    const upload=staged.data as unknown as {id:string;path:string;bucket:string;state:string;public_url:string|null};if(!upload?.id||!upload.path)throw new Error('Upload unavailable');
    const publicUrl=upload.public_url??storage.getPublicUrl(upload.bucket,upload.path),url=new URL(publicUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid storage URL');
    if(upload.state==='pending'){
      const saved=await storageDeadline(storage.upload(upload.bucket,upload.path,body,{contentType:'image/webp',upsert:true}));if(saved.error||!saved.data)throw new Error('Storage unavailable');
      const receipt=await service.rpc('finish_avatar_upload',{p_user_id:user.id,p_upload_id:upload.id,p_public_url:publicUrl});if(receipt.error||receipt.data!==true)throw new Error('Upload receipt unavailable');
    }
    return NextResponse.json({uploadId:upload.id,publicUrl},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof AvatarError?error.code:'AVATAR_UNAVAILABLE'},{status:error instanceof AvatarError?error.status:503});}
}
