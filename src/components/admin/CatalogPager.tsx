import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
export async function CatalogPager({base,total,cursor,nextCursor,search=''}:{base:string;total:number;cursor?:string|null;nextCursor:string|null;search?:string}){
  const t=await getTranslations('admin'),url=(next?:string)=>{const params=new URLSearchParams({...search?{search}:{},...next?{cursor:next}:{}});return base+(params.size?'?'+params:'');};
  return <nav aria-label={t('catalogPages')} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{t('catalogEntries',{count:total})}</span><div className="flex gap-4">{cursor&&<Link href={url()} className="text-accent hover:underline">{t('firstPage')}</Link>}{nextCursor&&<Link href={url(nextCursor)} className="text-accent hover:underline">{t('nextPage')}</Link>}</div></nav>;
}
