import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ArcCatalog} from '@/components/author/ArcCatalog';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('arcs');return {title:t('myArcs'),alternates:languageAlternates('/author/arcs')};}
export default async function AuthorArcsPage(){const user=await getCurrentUser();if(!user)redirect('/login');return <ArcCatalog key={user.id} actorId={user.id} owned/>;}
