import {getTranslations} from 'next-intl/server';
import {authChallengeConfig} from '@/lib/auth/challenges';
import {CaptchaBridge} from '@/components/auth/CaptchaBridge';
import type {Metadata} from 'next';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('auth');return {title:t('captchaTitle'),robots:{index:false},referrer:'no-referrer'};}
export default async function CaptchaPage(){const t=await getTranslations('auth'),config=authChallengeConfig();return <main className="max-w-sm mx-auto px-4 py-8 space-y-4"><h1 className="font-display text-2xl font-bold">{t('captchaTitle')}</h1><CaptchaBridge siteKey={config.enabled?config.siteKey:null}/></main>;}
