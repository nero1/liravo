'use client';
import {useState,useEffect,useRef} from 'react';
import {useTranslations} from 'next-intl';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {NOTIFICATION_KEYS,readNotificationPreferences,type NotificationPreferences,type NotificationPreferenceKey} from '@/lib/notification-preferences';

export function NotificationPreferencesForm({userId}:{userId:string}){
  const router=useRouter();
  const t=useTranslations('notificationPreferences'),common=useTranslations('common'),nav=useTranslations('nativeNavigation'),busy=useRef(false),abort=useRef(new AbortController());
  const [prefs,setPrefs]=useState<NotificationPreferences|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(false),[saved,setSaved]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const current=new AbortController();abort.current=current;setLoading(true);setLoadError(false);
    void fetch('/api/users/me',{signal:current.signal}).then(async response=>{
      const data=await response.json();if(data.user?.id&&data.user.id!==userId)router.refresh();
      if(!response.ok||data.user?.id!==userId)throw new Error('Account changed');
      const preferences=readNotificationPreferences(data.user);if(!current.signal.aborted)setPrefs(preferences);
    }).catch(()=>{if(!current.signal.aborted)setLoadError(true);}).finally(()=>{if(!current.signal.aborted)setLoading(false);});
    return()=>current.abort();
  },[userId,revision,router]);
  function toggle(key:NotificationPreferenceKey){setPrefs(current=>current?{...current,[key]:!current[key]}:current);setSaved(false);setSaveError(false);}
  async function save(){
    if(busy.current||!prefs)return;busy.current=true;setSaving(true);setSaveError(false);setSaved(false);
    try{
      const response=await fetch('/api/users/profile',{method:'PATCH',signal:abort.current.signal,headers:{'Content-Type':'application/json','X-Liravo-Actor':userId},body:JSON.stringify(prefs)}),data=await response.json();
      if(response.status===409)router.refresh();
      if(!response.ok||data.ok!==true||data.user?.id!==userId)throw new Error('Invalid preference receipt');
      const preferences=readNotificationPreferences(data.user);if(!abort.current.signal.aborted){setPrefs(preferences);setSaved(true);}
    }catch{if(!abort.current.signal.aborted)setSaveError(true);}
    finally{busy.current=false;if(!abort.current.signal.aborted)setSaving(false);}
  }
  return <div className="max-w-xl mx-auto px-4 py-6">
    <Link href="/settings" className="text-sm text-muted-foreground hover:underline">← {nav('settings')}</Link>
    <h1 className="font-display text-2xl font-bold mt-2">{t('title')}</h1><p className="text-sm text-muted-foreground mt-1 mb-6">{t('description')}</p>
    {loading?<p role="status">{common('loading')}</p>:loadError?<p role="alert" className="text-destructive">{t('loadFailed')} <button type="button" onClick={()=>setRevision(value=>value+1)} className="underline">{common('retry')}</button></p>:prefs&&<form onSubmit={event=>{event.preventDefault();void save();}} aria-busy={saving} className="space-y-6">
      {(['email','inApp'] as const).map(group=><fieldset key={group} disabled={saving} className="space-y-3"><legend className="font-semibold mb-2">{t(group)}</legend>
        {group==='email'&&<p className="text-sm text-muted-foreground">{t('paidEmail')}</p>}
        {NOTIFICATION_KEYS.filter(key=>(['email_digest_enabled','notify_new_releases'].includes(key))===(group==='email')).map(key=><label key={key} className="flex justify-between items-center gap-4 p-3 border border-border rounded-xl"><span>{t('flags.'+key)}</span><input type="checkbox" role="switch" aria-checked={prefs[key]} checked={prefs[key]} onChange={()=>toggle(key)}/></label>)}
      </fieldset>)}
      {saveError&&<p role="alert" className="text-destructive">{t('saveFailed')}</p>}{saved&&<p role="status" className="text-green-600">{t('saved')}</p>}
      <button type="submit" disabled={saving} className="bg-accent text-accent-foreground rounded-lg px-4 py-2 disabled:opacity-50">{saving?common('saving'):common('save')}</button>
    </form>}
  </div>;
}
