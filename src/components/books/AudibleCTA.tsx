'use client';

import {Headphones} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useBookLinkClick} from '@/lib/client/useBookLinkClick';

export function AudibleCTA({link,bookId,userId}:{link:{linkId:string;url:string;isAffiliate:boolean};bookId:string;userId?:string}){
  const t=useTranslations('books'),record=useBookLinkClick(bookId,userId);
  return <a href={link.url} target="_blank" rel={link.isAffiliate?'sponsored nofollow noopener noreferrer':'nofollow noopener noreferrer'} onClick={()=>{void record(link.linkId).catch(()=>{});}} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"><Headphones size={16} aria-hidden="true"/>{t('listenOnAudible')}</a>;
}
