import {createServiceClient} from '@/lib/supabase/server';

export async function profileVisibleTo(ownerId:string,viewerId:string|null){
  const {data,error}=await createServiceClient().rpc('reading_author_visible' as never,{p_author:ownerId,p_user:viewerId} as never);
  if(error||typeof data!=='boolean')throw new Error('Profile visibility unavailable');
  return data;
}
