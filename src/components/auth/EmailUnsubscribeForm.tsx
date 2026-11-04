'use client';
import {useEffect,useState,useRef} from 'react';
import {useTranslations} from 'next-intl';
import Link from 'next/link';
export function EmailUnsubscribeForm(){
 const t=useTranslations('emailUnsubscribe'),[token,setToken]=useState<string|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[failed,setFailed]=useState(false),lock=useRef(false),active=useRef<string|null>(null);
 const storageKey='liravo:email-unsubscribe';
 function complete(value:string){try{if(sessionStorage.getItem(storageKey)===value)sessionStorage.removeItem(storageKey);}catch{}}
 useEffect(()=>{function read(){let value=new URLSearchParams(location.hash.slice(1)).get('token');try{if(value===null)value=sessionStorage.getItem(storageKey);else if(/^[a-f0-9]{64}$/.test(value))sessionStorage.setItem(storageKey,value);else sessionStorage.removeItem(storageKey);}catch{}const valid=value&&/^[a-f0-9]{64}$/.test(value)?value:null;active.current=valid;lock.current=false;setToken(valid);setDone(false);setFailed(false);setBusy(false);history.replaceState(null,'',location.pathname+location.search);setReady(true);}read();window.addEventListener('hashchange',read);return()=>{window.removeEventListener('hashchange',read);active.current=null;};},[]);
 async function submit(event:React.FormEvent){event.preventDefault();if(!token||done||lock.current)return;const current=token;lock.current=true;setBusy(true);setFailed(false);try{const response=await fetch('/api/users/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:current})}),data=await response.json();if(active.current!==current)return;if(!response.ok||data.ok!==true){if(response.status===410){complete(current);setToken(null);}else setFailed(true);return;}complete(current);setDone(true);setToken(null);}catch{if(active.current===current)setFailed(true);}finally{if(active.current===current){lock.current=false;setBusy(false);}}}

 return <div className="space-y-4"><p className="text-sm text-muted-foreground">{t('description')}</p>{!ready?<p role="status">{t('loading')}</p>:done?<p role="status">{t('done')}</p>:!token?<p role="alert">{t('invalid')}</p>:<form onSubmit={submit}><button disabled={busy} className="w-full rounded-lg border px-3 py-3 disabled:opacity-50">{t(busy?'pending':'confirm')}</button></form>}{failed&&<p role="alert">{t('failed')}</p>}<Link href="/settings/notifications" className="block text-sm text-accent">{t('settings')}</Link></div>;
}
