import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {AuthorQuestionQueue} from '@/components/author/AuthorQuestionQueue';
export async function generateMetadata(){const t=await getTranslations('authorQA');return{title:t('ownerTitle'),robots:{index:false,follow:false}};}
export default async function AuthorQAPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <AuthorQuestionQueue key={user.id} actorId={user.id}/>;}
