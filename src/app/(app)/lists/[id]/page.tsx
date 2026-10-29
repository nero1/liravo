import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingList,ReadingListError} from '@/lib/reading-lists';
import {languageAlternates} from '@/lib/metadata';
import {APP_URL} from '@/constants/config';
import {ReadingListContents} from '@/components/lists/ReadingListForms';
import {RefreshButton} from '@/components/layout/RefreshButton';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:{id:string}}){const t=await getTranslations('readingLists');if(!z.string().uuid().safeParse(params.id).success)return {title:t('title'),robots:{index:false,follow:false}};try{const data=await getReadingList(null,params.id);return {title:data.list.name,description:data.list.description??undefined,alternates:languageAlternates('/lists/'+params.id),openGraph:{title:data.list.name,description:data.list.description??'',url:APP_URL+'/lists/'+params.id,type:'website',images:[APP_URL+'/opengraph-image']},twitter:{card:'summary',title:data.list.name,description:data.list.description??'',images:[APP_URL+'/opengraph-image']}};}catch{return {title:t('title'),robots:{index:false,follow:false}};}}
export default async function Page({params}:{params:{id:string}}){if(!z.string().uuid().safeParse(params.id).success)notFound();const user=await getCurrentUser(),t=await getTranslations('readingLists');try{const initial=await getReadingList(user?.id??null,params.id);return <ReadingListContents key={(user?.id??'public')+':'+params.id} initial={initial}/>;}catch(error){if(error instanceof ReadingListError&&error.status===404)notFound();return <div className="max-w-2xl mx-auto p-8"><h1 className="text-2xl font-bold">{t('title')}</h1><p role="alert">{t('loadFailed')} <RefreshButton/></p></div>;}}
