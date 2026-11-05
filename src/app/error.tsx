'use client';
import {useTranslations} from 'next-intl';
export default function RootError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 const t=useTranslations('errors'),common=useTranslations('common');
 return <div className="max-w-lg mx-auto p-8 space-y-4"><h1 className="text-2xl font-bold">{t('title')}</h1><p>{t('description')}</p><button onClick={reset} className="underline">{common('retry')}</button></div>;
}
