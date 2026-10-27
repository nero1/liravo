import {getTranslations} from 'next-intl/server';
import {EmailRecoveryForm} from '@/components/auth/EmailRecoveryForm';
import type {Metadata} from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('emailSecurity');return {title:t('confirm'),robots:{index:false},referrer:'no-referrer'};}
export default async function EmailConfirmationPage(){const t=await getTranslations('emailSecurity');return <main className="max-w-sm mx-auto px-4 py-12 space-y-4"><h1 className="font-display text-2xl font-bold">{t('confirm')}</h1><EmailRecoveryForm confirmation/></main>;}
