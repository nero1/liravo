import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {notFound,redirect} from 'next/navigation';
import {AskAuthorForm} from '@/components/author/AskAuthorForm';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('authorQA');return{title:t('askQuestion'),robots:{index:false,follow:false}};}
export default async function AskAuthorPage(props:{params: Promise<{username:string}>}) {
 const params = await props.params;
 const user=await getCurrentUser();if(!user)redirect('/login');
 const{data:author,error}=await createServiceClient().from('users').select('id,username,is_verified_author,user_types').eq('username',params.username).is('deleted_at',null).eq('is_banned',false).single();
 if(error&&error.code!=='PGRST116')throw Error('Author unavailable');
 if(!author||!author.is_verified_author&&!(author.user_types??[]).includes('author'))notFound();
 return <AskAuthorForm key={user.id+author.id} actorId={user.id} authorId={author.id} username={author.username}/>;
}
