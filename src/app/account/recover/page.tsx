import {getTranslations} from 'next-intl/server';
import {EmailRecoveryForm} from '@/components/auth/EmailRecoveryForm';
import type {Metadata} from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('emailSecurity');return {title:t('recover'),robots:{index:false}};}
export default async function AccountRecoveryPage(){const t=await getTranslations('emailSecurity');return <main className="max-w-sm mx-auto px-4 py-12 space-y-4"><h1 className="font-display text-2xl font-bold">{t('recover')}</h1><EmailRecoveryForm/></main>;}
