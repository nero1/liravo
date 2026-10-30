'use client';

import { useTranslations } from 'next-intl';
import { useCallback,useEffect,useRef,useState } from 'react';

interface ThemeRecord {
  name: string;
  css_overrides: string;
  is_active: boolean;
}

export default function ThemeAdminPage() {
  const t = useTranslations('admin'),common=useTranslations('common');
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false),alive=useRef(false),version=useRef(0);
  const [newName, setNewName] = useState('');
  const [newCss, setNewCss] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const loadThemes=useCallback(async(cursor:string|null=null,signal?:AbortSignal)=>{
    const request=++version.current;setLoading(true);setMessage(null);
    try{
      const response=await fetch('/api/admin/themes'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal});if(!response.ok)throw new Error('Themes unavailable');
      const data=await response.json() as {themes:ThemeRecord[];nextCursor:string|null};if(!Array.isArray(data.themes))throw new Error('Invalid themes');
      if(!alive.current||signal?.aborted||request!==version.current)return false;
      setThemes(previous=>cursor?[...previous,...data.themes.filter(theme=>!previous.some(old=>old.name===theme.name))]:data.themes);setNextCursor(data.nextCursor);setLoaded(true);return true;
    }catch{if(alive.current&&!signal?.aborted&&request===version.current)setMessage({text:t('loadThemesFailed'),ok:false});return false;}
    finally{if(alive.current&&request===version.current)setLoading(false);}
  },[t]);
  useEffect(()=>{alive.current=true;const controller=new AbortController();void loadThemes(null,controller.signal);return()=>{alive.current=false;controller.abort();};},[loadThemes]);

  const activate = async (name: string,is_active:boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/themes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, is_active }),
      });
      if (res.ok) {
        const receipt=await res.json() as {theme?:ThemeRecord};if(receipt.theme?.name!==name||receipt.theme.is_active!==is_active)throw new Error('Invalid theme receipt');
        if(!await loadThemes())throw new Error('Theme refresh unavailable');
        window.dispatchEvent(new Event('liravo:theme-changed'));
        setMessage({ text: t(is_active?'themeActivated':'themeDeactivated', { name }), ok: true });
      } else {
        setMessage({ text: t('activateThemeFailed'), ok: false });
      }
    } catch { setMessage({ text: t('updateFailed'), ok: false }); }
    finally { setSaving(false); }
  };

  const create = async () => {
    if (!newName.trim()) {
      setMessage({ text: t('themeNameRequired'), ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), css_overrides: newCss }),
      });
      if (res.ok) {
        const data = await res.json() as {ok?:boolean;theme?:ThemeRecord};
        if(data.ok!==true||data.theme?.name!==newName.trim()||typeof data.theme.is_active!=='boolean')throw new Error('Invalid theme receipt');
        if (data.theme) setThemes((prev) => [data.theme!,...prev.filter(theme=>theme.name!==data.theme!.name)]);
        setNewName('');
        setNewCss('');
        setMessage({ text: t('themeCreated'), ok: true });
      } else {
        setMessage({ text: t('createThemeFailed'), ok: false });
      }
    } catch { setMessage({ text: t('updateFailed'), ok: false }); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">{t('themeConfiguration')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t('themeDescription')}</p>

      {message && (
        <div role={message.ok ? 'status' : 'alert'} className={`mb-4 p-3 rounded-lg text-sm ${message.ok ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3 mb-8">
        <h2 className="font-medium">{t('existingThemes')}</h2>
        {loaded&&themes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCustomThemesYet')}</p>
        ) : themes.map((theme) => (
          <div key={theme.name} className="flex items-center justify-between p-3 border border-border rounded-xl">
            <div>
              <span className="font-medium text-sm">{theme.name}</span>
              {theme.is_active && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 font-medium">{t('active')}</span>
              )}
            </div>
            {(
              <button
                onClick={() => activate(theme.name,!theme.is_active)}
                disabled={saving||loading}
                className="text-xs px-3 py-1.5 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-60"
              >{t(theme.is_active?'deactivate':'activate')}</button>
            )}
          </div>
        ))}
        {loading&&<p role="status" className="text-sm text-muted-foreground">{common('loading')}</p>}
        {!loaded&&!loading&&<button onClick={()=>void loadThemes()} className="text-sm text-accent">{common('retry')}</button>}
        {nextCursor&&<button disabled={loading||saving} onClick={()=>void loadThemes(nextCursor)} className="text-sm text-accent disabled:opacity-60">{common('loadMore')}</button>}
      </div>

      <div aria-busy={saving} className="border border-border rounded-xl p-4 space-y-4">
        <h2 className="font-medium">{t('addNewTheme')}</h2>
        <div>
          <label htmlFor="theme-name" className="block text-xs font-medium mb-1.5">{t('themeName')}</label>
          <input id="theme-name" maxLength={80} disabled={saving||loading}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('eGMidnightForest')}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div>
          <label htmlFor="theme-css" className="block text-xs font-medium mb-1.5">{t('cssVariableOverrides')}</label>
          <textarea id="theme-css" maxLength={50000} disabled={saving||loading}
            value={newCss}
            onChange={(e) => setNewCss(e.target.value)}
            rows={8}
            placeholder={`:root {\n  --background: #0a0a0a;\n  --foreground: #fafafa;\n  --accent: #16a34a;\n}`}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y"
          />
        </div>
        <button
          onClick={create}
          disabled={saving||loading}
          className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
        >
          {saving ? t('saving') : t('createTheme')}
        </button>
      </div>
    </div>
  );
}
