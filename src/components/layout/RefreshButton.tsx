'use client';
import {useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
export function RefreshButton(){const router=useRouter(),t=useTranslations('common'),[pending,start]=useTransition();return <button type="button" disabled={pending} aria-busy={pending} onClick={()=>start(()=>router.refresh())} className="underline disabled:opacity-50">{t('retry')}</button>;}
