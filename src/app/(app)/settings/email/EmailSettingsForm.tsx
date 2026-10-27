'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';

export default function EmailSettingsForm({currentEmail,isVerified,pinRequired,actorId}:{currentEmail:string|null;isVerified:boolean;pinRequired:boolean;actorId:string}){
  const t=useTranslations('emailSecurity');
  const [email,setEmail]=useState(currentEmail??''),[pin,setPin]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState<'sent'|'failed'|null>(null);
  async function save(event:React.FormEvent){
    event.preventDefault();if(saving)return;setSaving(true);setMessage(null);
    try{
      const response=await fetch('/api/users/send-verification',{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':actorId},body:JSON.stringify({email:email.trim().toLowerCase(),...(pinRequired?{pin}:{})})});
      const data=await response.json();if(!response.ok||!data.ok)throw new Error('Email unavailable');
      setPin('');setMessage('sent');
    }catch{setMessage('failed');}finally{setSaving(false);}
  }
  return <form onSubmit={save} aria-busy={saving}><fieldset disabled={saving} className="space-y-4">
    <label htmlFor="recovery-email" className="block text-sm space-y-1"><span>{t('email')}</span><input id="recovery-email" required type="email" maxLength={254} autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="block w-full px-3 py-2.5 border border-border rounded-lg bg-background"/></label>
    {email===currentEmail&&<p className="text-sm text-muted-foreground">{t(isVerified?'verified':'unverified')}</p>}
    {pinRequired&&<label htmlFor="email-pin" className="block text-sm space-y-1"><span>{t('pin')}</span><input id="email-pin" required type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))} aria-describedby="email-pin-hint" className="block w-full px-3 py-2.5 border border-border rounded-lg bg-background"/><span id="email-pin-hint" className="text-xs text-muted-foreground">{t('pinHint')}</span></label>}
    {message&&<p role={message==='sent'?'status':'alert'} className="text-sm">{t(message)}</p>}
    <button disabled={saving} className="w-full py-3 bg-accent text-accent-foreground rounded-lg disabled:opacity-60">{t(saving?'pending':'send')}</button>
  </fieldset></form>;
}
