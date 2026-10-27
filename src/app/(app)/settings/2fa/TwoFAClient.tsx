'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import Image from 'next/image';

type Phase='idle'|'setup'|'codes'|'disable';
export default function TwoFAClient({enabled,pinRequired,actorId}:{enabled:boolean;pinRequired:boolean;actorId:string}){
  const t=useTranslations('accountSecurity');
  const [phase,setPhase]=useState<Phase>('idle'),[active,setActive]=useState(enabled),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const [secret,setSecret]=useState(''),[qr,setQr]=useState(''),[token,setToken]=useState(''),[code,setCode]=useState(''),[pin,setPin]=useState(''),[codes,setCodes]=useState<string[]>([]),[disableKey,setDisableKey]=useState(()=>crypto.randomUUID());
  function clear(){setPhase('idle');setCode('');setPin('');setSecret('');setQr('');setToken('');setCodes([]);setFailed(false);}
  async function mutate(action:'start'|'confirm'|'disable'){
    if(busy)return;setBusy(true);setFailed(false);
    try{
      const body=action==='disable'?(/^\d{6}$/.test(code)?{code}:{recoveryCode:code}):action==='start'?{action}:{action,enrollmentToken:token,code,...(pinRequired?{pin}:{})};
      const response=await fetch(action==='disable'?'/api/auth/2fa/disable':'/api/auth/2fa/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':actorId,...(action==='disable'?{'Idempotency-Key':disableKey}:{})},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error('Factor unavailable');
      if(action==='start'){
        if(typeof data.secret!=='string'||typeof data.qrDataUrl!=='string'||typeof data.enrollmentToken!=='string')throw new Error('Invalid enrollment');
        setSecret(data.secret);setQr(data.qrDataUrl);setToken(data.enrollmentToken);setPhase('setup');
      }else if(action==='confirm'){
        if(!data.ok||!Array.isArray(data.recoveryCodes)||data.recoveryCodes.length!==8)throw new Error('Invalid recovery codes');
        setCodes(data.recoveryCodes);setPin('');setCode('');setSecret('');setQr('');setToken('');setActive(true);setPhase('codes');
      }else{if(!data.ok)throw new Error('Invalid acknowledgement');setActive(false);clear();}
    }catch{setFailed(true);}finally{setBusy(false);}
  }
  function download(){
    const url=URL.createObjectURL(new Blob([t('recoveryDescription')+'\n\n'+codes.join('\n')],{type:'text/plain'})),anchor=document.createElement('a');
    anchor.href=url;anchor.download='liravo-recovery-codes.txt';anchor.click();URL.revokeObjectURL(url);
  }
  const button='w-full py-2.5 border border-border rounded-lg text-sm disabled:opacity-60';
  return <div className="space-y-4" aria-busy={busy}>
    {failed&&<p role="alert" className="text-sm text-destructive">{t('factorFailed')}</p>}
    {phase==='idle'&&<><p className="text-sm">{t(active?'factorActive':'factorInactive')}</p><button disabled={busy} className={button} onClick={()=>{if(active){setDisableKey(crypto.randomUUID());setPhase('disable');setFailed(false);}else void mutate('start');}}>{t(active?'disableFactor':'setup')}</button></>}
    {phase==='codes'&&<><h2 className="font-semibold">{t('recoveryTitle')}</h2><p className="text-sm text-muted-foreground">{t('recoveryDescription')}</p><div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-xl font-mono text-sm">{codes.map(value=><span key={value}>{value}</span>)}</div><button className={button} onClick={download}>{t('download')}</button><button className={button} onClick={clear}>{t('done')}</button></>}
    {(phase==='setup'||phase==='disable')&&<form onSubmit={event=>{event.preventDefault();void mutate(phase==='setup'?'confirm':'disable');}}><fieldset disabled={busy} className="space-y-4">
      {phase==='setup'&&<><h2 className="font-semibold">{t('scan')}</h2>{qr&&<Image src={qr} alt={t('qr')} width={200} height={200}/>}<details><summary>{t('manual')}</summary><code className="block break-all">{secret}</code></details></>}
      <label htmlFor="factor-code" className="block text-sm space-y-1"><span>{t(phase==='setup'?'otp':'factorCode')}</span><input id="factor-code" required type="text" inputMode={phase==='setup'?'numeric':'text'} autoComplete="one-time-code" maxLength={phase==='setup'?6:11} pattern={phase==='setup'?'[0-9]{6}':'[0-9]{6}|[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}'} value={code} onChange={event=>setCode(phase==='setup'?event.target.value.replace(/\D/g,'').slice(0,6):event.target.value.toUpperCase().slice(0,11))} className="block w-full px-3 py-2.5 border border-border rounded-lg bg-background"/></label>
      {phase==='setup'&&pinRequired&&<label htmlFor="recovery-code-pin" className="block text-sm space-y-1"><span>{t('currentPin')}</span><input id="recovery-code-pin" required type="password" inputMode="numeric" autoComplete="off" minLength={4} maxLength={4} pattern="[0-9]{4}" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))} aria-describedby="recovery-code-pin-hint" className="block w-full px-3 py-2.5 border border-border rounded-lg bg-background"/><span id="recovery-code-pin-hint">{t('recoveryPin')}</span></label>}
      <button disabled={busy} className={button}>{t(busy?'factorPending':phase==='setup'?'enable':'disableFactor')}</button><button disabled={busy} type="button" className={button} onClick={clear}>{t('cancel')}</button>
    </fieldset></form>}
  </div>;
}
