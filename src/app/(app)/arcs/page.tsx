import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {ArcCatalog} from '@/components/author/ArcCatalog';
import {z} from 'zod';
import {notFound,redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('arcs');return {title:t('title'),description:t('description'),alternates:languageAlternates('/arcs')};}
export default async function ArcsPage({searchParams}:{searchParams?:{authorId?:string}}){const authorId=searchParams?.authorId??null;if(authorId&&!z.string().uuid().safeParse(authorId).success)notFound();const user=await getCurrentUser();if(!user)redirect('/login');return <ArcCatalog key={user.id} actorId={user.id} authorId={authorId}/>;}
