'use client';

import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';

export default function PINSettingsClient({actorId}:{actorId:string}){
  const t=useTranslations('accountSecurity');
  const [configured,setConfigured]=useState<boolean|null>(null),[currentPin,setCurrentPin]=useState(''),[pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState<'saved'|'failed'|'mismatch'|null>(null);
  useEffect(()=>{const controller=new AbortController();fetch('/api/auth/pin',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('PIN unavailable');const data=await response.json();if(typeof data.configured!=='boolean')throw new Error('PIN unavailable');setConfigured(data.configured);}).catch(()=>{if(!controller.signal.aborted)setMessage('failed');});return()=>controller.abort();},[]);
  async function save(event:React.FormEvent){
    event.preventDefault();if(saving)return;if(pin!==confirm){setMessage('mismatch');return;}
    setSaving(true);setMessage(null);
    try{
      const response=await fetch('/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':actorId},body:JSON.stringify({pin,...(configured?{currentPin}:{})})});
      const data=await response.json();if(!response.ok||!data.success)throw new Error('PIN unavailable');
      setConfigured(true);setPin('');setConfirm('');setCurrentPin('');setMessage('saved');
    }catch{setMessage('failed');}finally{setSaving(false);}
  }
  const field=(id:string,value:string,set:(value:string)=>void,label:string)=><label htmlFor={id} className="block text-sm space-y-1"><span>{label}</span><input id={id} type="password" inputMode="numeric" autoComplete="off" minLength={4} maxLength={4} pattern="[0-9]{4}" required value={value} onChange={event=>set(event.target.value.replace(/\D/g,'').slice(0,4))} className="block w-full px-3 py-2.5 border border-border rounded-lg bg-background tracking-widest text-center"/></label>;
  return <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
    <h1 className="font-display text-2xl font-bold">{t('pinTitle')}</h1><p className="text-sm text-muted-foreground">{t('pinDescription')}</p>
    {message&&<p role={message==='saved'?'status':'alert'}>{t(message)}</p>}
    <form onSubmit={save} aria-busy={saving}><fieldset disabled={saving||configured===null} className="space-y-4">
      {configured&&field('current-pin',currentPin,setCurrentPin,t('currentPin'))}
      {field('new-pin',pin,setPin,t('newPin'))}{field('confirm-pin',confirm,setConfirm,t('confirmPin'))}
      <button disabled={saving||configured===null||pin.length!==4} className="w-full py-3 rounded-lg bg-accent text-accent-foreground disabled:opacity-60">{t(saving?'saving':'savePin')}</button>
    </fieldset></form>
  </div>;
}
