import {getTranslations} from 'next-intl/server';
import {EmailUnsubscribeForm} from '@/components/auth/EmailUnsubscribeForm';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('emailUnsubscribe');return{title:t('title'),robots:{index:false},referrer:'no-referrer'as const};}
export default async function Page(){const t=await getTranslations('emailUnsubscribe');return <main className="max-w-sm mx-auto px-4 py-12 space-y-4"><h1 className="font-display text-2xl font-bold">{t('title')}</h1><EmailUnsubscribeForm/></main>;}
