'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function SecondFactorForm({challengeToken,onSuccess,onCancel}:{challengeToken:string;onSuccess:(user?:{onboarding_complete?:boolean})=>void;onCancel:()=>void}) {
  const t=useTranslations('auth');
  const [value,setValue]=useState(''),[recovery,setRecovery]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(false);
  async function submit(event:React.FormEvent){
    event.preventDefault();setPending(true);setError(false);
    try{
      const response=await fetch('/api/auth/2fa/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeToken,...(recovery?{recoveryCode:value}:{code:value})})});
      if(!response.ok){setError(true);return;}
      const data=await response.json();onSuccess(data.user);
    }catch{setError(true);}finally{setPending(false);}
  }
  return <form onSubmit={submit} className="space-y-4">
    <h2 className="font-semibold">{t('mfaTitle')}</h2>
    <p className="text-sm text-muted-foreground">{t('mfaDescription')}</p>
    <label htmlFor="second-factor-code" className="block text-sm font-medium">{recovery?t('recoveryCode'):t('authenticatorCode')}</label>
    <input id="second-factor-code" name="code" value={value} onChange={event=>setValue(event.target.value)} inputMode={recovery?'text':'numeric'} autoComplete="one-time-code" required maxLength={recovery?11:6} pattern={recovery?'[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}':'[0-9]{6}'} className="w-full rounded-lg border border-border bg-background p-3" />
    {error&&<p role="alert" className="text-sm text-destructive">{t('mfaFailed')}</p>}
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent p-3 text-accent-foreground disabled:opacity-60">{pending?t('mfaVerifying'):t('mfaVerify')}</button>
    <button type="button" disabled={pending} onClick={()=>{setRecovery(!recovery);setValue('');setError(false);}} className="w-full text-sm">{recovery?t('useAuthenticator'):t('useRecovery')}</button>
    <button type="button" disabled={pending} onClick={onCancel} className="w-full text-sm text-muted-foreground">{t('mfaCancel')}</button>
  </form>;
}
