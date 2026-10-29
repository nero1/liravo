import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWriterThread} from '@/lib/writer-questions';
import {WriterQuestionThread} from '@/components/writing/WriterQuestionThread';
import {languageAlternates} from '@/lib/metadata';
import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:{id:string}}){const t=await getTranslations('writerQuestions');return {title:t('threadTitle'),alternates:languageAlternates('/write/ask/'+encodeURIComponent(params.id))};}
export default async function QuestionPage({params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)redirect('/login');if(!z.string().uuid().safeParse(params.id).success)notFound();
  const thread=await getWriterThread(params.id,user.id);if(!thread)notFound();return <WriterQuestionThread key={user.id+':'+params.id} actorId={user.id} initial={thread}/>;
}
