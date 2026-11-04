'use client';

import { useState } from 'react';
import {useTranslations} from 'next-intl';
import {useContentCreation} from '@/lib/client/useContentCreation';
import { useRouter } from 'next/navigation';

const FREE_SHELF_LIMIT = 10;

interface NewShelfFormProps {
  userId: string;
  customShelfCount: number;
  isPremium?: boolean;
}

export function NewShelfForm(props:NewShelfFormProps){return <OwnedNewShelfForm key={props.userId} {...props}/>;}
function OwnedNewShelfForm({userId,customShelfCount,isPremium=false}:NewShelfFormProps){
  const t=useTranslations('shelfForm'),common=useTranslations('common');
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const creation=useContentCreation(userId,'/api/shelves','shelf',(value:unknown):value is {actorId:string;shelf:{id:string;user_id:string;slug:string}}=>{
    const result=value as {actorId?:string;shelf?:{id?:string;user_id?:string;slug?:string}}|null;
    return result?.actorId===userId&&result.shelf?.user_id===userId&&typeof result.shelf.id==='string'&&typeof result.shelf.slug==='string'&&/^[a-z0-9_-]+$/.test(result.shelf.slug);
  },result=>{router.push('/shelf/'+encodeURIComponent(result.shelf.slug));router.refresh();});
  const saving=creation.saving||creation.checking;
  const [error, setError] = useState<string | null>(null);

  // Premium users have unlimited shelves
  const atLimit = !isPremium && customShelfCount >= FREE_SHELF_LIMIT;

  const handleSave = async () => {
    if(saving)return;
    if(!name.trim()){setError(t('nameRequired'));return;}
    if(atLimit){setError(t('limit',{count:FREE_SHELF_LIMIT}));return;}
    setError(null);await creation.submit({name:name.trim(),description:description.trim(),is_public:isPublic});
  };

  return (
    <div className="space-y-5">
      {atLimit && (
        <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
          {t('limit',{count:FREE_SHELF_LIMIT})}
        </div>
      )}

      <div>
        <label htmlFor={'shelf-name-'+userId} className="block text-sm font-medium mb-1.5">{t('name')}</label>
        <input id={'shelf-name-'+userId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder={t('example')}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
          disabled={atLimit||saving}
        />
      </div>

      <div>
        <label htmlFor={'shelf-description-'+userId} className="block text-sm font-medium mb-1.5">{t('description')}</label>
        <textarea id={'shelf-description-'+userId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={2}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm resize-none"
          disabled={atLimit||saving}
        />
      </div>

      <div className="flex items-center justify-between p-3 border border-border rounded-lg">
        <div>
          <p className="font-medium text-sm">{t('public')}</p>
          <p className="text-xs text-muted-foreground">{t('visible')}</p>
        </div>
        <button
          type="button" role="switch" aria-checked={isPublic} aria-label={t('public')}
          onClick={() => setIsPublic((v) => !v)}
          className={`relative w-10 h-6 rounded-full transition-colors ${isPublic ? 'bg-accent' : 'bg-muted'}`}
          disabled={atLimit||saving}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-4' : ''}`}
          />
        </button>
      </div>

      {creation.failed&&<p role="alert" className="text-sm text-destructive">{t('failed')} {creation.checking&&<button type="button" onClick={()=>void creation.recover()} className="underline">{common('retry')}</button>}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          disabled={saving} onClick={() => router.back()}
          className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors text-sm"
        >
          {common('cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || atLimit}
          className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors text-sm disabled:opacity-60"
        >
          {creation.checking?common('loading'):saving?t('creating'):t('create')}
        </button>
      </div>
    </div>
  );
}
