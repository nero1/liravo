import {getTranslations} from 'next-intl/server';
import Link from 'next/link';
export default async function NotFound(){const t=await getTranslations('errors');return <div className="max-w-lg mx-auto p-8 space-y-4"><h1 className="text-2xl font-bold">{t('notFound')}</h1><p>{t('notFoundDescription')}</p><Link href="/" className="underline">{t('home')}</Link></div>;}
