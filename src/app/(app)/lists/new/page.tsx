import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {NewReadingList} from '@/components/lists/ReadingListForms';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('readingLists');return {title:t('create'),alternates:languageAlternates('/lists/new')};}
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');return <NewReadingList key={user.id} actorId={user.id}/>;}
