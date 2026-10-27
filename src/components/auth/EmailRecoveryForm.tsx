'use client';

import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {SecondFactorForm} from './SecondFactorForm';

export function EmailRecoveryForm({confirmation=false}:{confirmation?:boolean}){
  const t=useTranslations('emailSecurity'),router=useRouter();
  const [email,setEmail]=useState(''),[proof,setProof]=useState<{token:string;purpose:'verify'|'recover'}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[challenge,setChallenge]=useState<string|null>(null);
  useEffect(()=>{if(!confirmation)return;const params=new URLSearchParams(location.hash.slice(1)),token=params.get('token'),purpose=params.get('purpose');if(token&&/^[a-f0-9]{64}$/.test(token)&&(purpose==='verify'||purpose==='recover'))setProof({token,purpose});else setMessage('invalid');},[confirmation]);
  function complete(user?:{onboarding_complete?:boolean}){history.replaceState(null,'',location.pathname);router.replace(user?.onboarding_complete===false?'/onboarding':'/');router.refresh();}
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy||confirmation&&!proof)return;setBusy(true);setMessage(null);
    try{
      const response=await fetch(confirmation?(proof!.purpose==='verify'?'/api/users/verify-email':'/api/users/verify-recovery'):'/api/users/account-recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(confirmation?{token:proof!.token}:{email:email.trim().toLowerCase()})});
      const data=await response.json();
      if(!response.ok){setMessage(response.status===410||response.status===422?'invalid':confirmation?'confirmationFailed':'requestFailed');return;}
      if(!confirmation){setMessage('requested');return;}
      history.replaceState(null,'',location.pathname);
      if(proof!.purpose==='verify'){setProof(null);setMessage('confirmed');return;}
      if(data.mfaRequired){setChallenge(data.challengeToken);return;}
      complete(data.user);
    }catch{setMessage(confirmation?'confirmationFailed':'requestFailed');}finally{setBusy(false);}
  }
  if(challenge)return <SecondFactorForm challengeToken={challenge} onSuccess={complete} onCancel={()=>router.replace('/login')}/>;
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">{t(confirmation?'confirmationDescription':'recoverDescription')}</p>
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy} className="space-y-4">
      {!confirmation&&<label htmlFor="account-recovery-email" className="block text-sm space-y-1"><span>{t('email')}</span><input id="account-recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} className="block w-full border border-border rounded-lg bg-background px-3 py-2.5"/></label>}
      {(!confirmation||proof)&&<button disabled={busy||confirmation&&!proof} className="w-full py-3 bg-accent text-accent-foreground rounded-lg disabled:opacity-60">{t(busy?'pending':confirmation?(proof?.purpose==='recover'?'continue':'confirm'):'request')}</button>}
    </fieldset></form>
    {message&&<p role={['requested','confirmed'].includes(message)?'status':'alert'} className="text-sm">{t(message)}</p>}
    {message==='confirmed'&&<Link className="block text-accent" href="/settings/email">{t('settings')}</Link>}
    <Link className="block text-sm text-accent" href="/login">{t('back')}</Link>
  </div>;
}
