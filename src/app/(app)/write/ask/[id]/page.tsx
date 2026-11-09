import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWriterThread} from '@/lib/writer-questions';
import {WriterQuestionThread} from '@/components/writing/WriterQuestionThread';
import {languageAlternates} from '@/lib/metadata';
import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function generateMetadata(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const t=await getTranslations('writerQuestions');return {title:t('threadTitle'),alternates:languageAlternates('/write/ask/'+encodeURIComponent(params.id))};
}
export default async function QuestionPage(props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)redirect('/login');if(!z.string().uuid().safeParse(params.id).success)notFound();
  const thread=await getWriterThread(params.id,user.id);if(!thread)notFound();return <WriterQuestionThread key={user.id+':'+params.id} actorId={user.id} initial={thread}/>;
}
