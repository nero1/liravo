import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {WriterQuestions} from '@/components/writing/WriterQuestions';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('writerQuestions');return {title:t('title'),description:t('description'),alternates:languageAlternates('/write/ask')};}
export default async function AskWriterPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <WriterQuestions key={user.id} actorId={user.id}/>;}
