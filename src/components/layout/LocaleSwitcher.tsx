'use client';

import { useLocale,useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { useState,useRef,useId } from 'react';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
] as const;

export function LocaleSwitcher() {
  const locale=useLocale(),t=useTranslations('navigation'),busy=useRef(false),listId=useId(),[saving,setSaving]=useState(false),[error,setError]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSelect(code: string) {
    if(code===locale||busy.current){setOpen(false);return;}
    busy.current=true;setSaving(true);setError(false);
    try{
      const response=await fetch('/api/users/locale',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:code})});
      const result=await response.json();if(!response.ok||result.locale!==code)throw new Error('Locale update unavailable');
      setOpen(false);router.refresh();
    }catch{setError(true);}
    finally{busy.current=false;setSaving(false);}
  }

  return (
    <div className="relative" onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
      <button ref={trigger}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
        aria-label={t('language')} aria-expanded={open} aria-controls={listId} disabled={saving} aria-busy={saving}
      >
        <Globe aria-hidden="true" size={16} strokeWidth={1.75} />
        <span>{locale.toUpperCase()}</span>
      </button>

      {error&&<p role="alert" className="text-xs text-destructive">{t('languageFailed')}</p>}
      <div hidden={!open} id={listId} className="absolute bottom-full left-0 mb-1 w-28 bg-card border border-border rounded-lg shadow-md overflow-hidden z-50">
          {LOCALES.map(({ code, label }) => (
            <button
              key={code} lang={code} aria-label={t('languageName.'+code)} disabled={saving} aria-pressed={code===locale}
              onClick={() => handleSelect(code)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                code === locale
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
    </div>
  );
}
