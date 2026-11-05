'use client';

import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {HCaptcha} from './HCaptcha';

declare global{interface Window{ReactNativeWebView?:{postMessage:(message:string)=>void};}}
export function CaptchaBridge({siteKey}:{siteKey:string|null}){
  const t=useTranslations('auth'),[nonce,setNonce]=useState<string|null|undefined>(undefined),[complete,setComplete]=useState(false);
  useEffect(()=>{const value=new URLSearchParams(location.hash.slice(1)).get('nonce');setNonce(value&&/^[a-f0-9-]{36}$/.test(value)?value:null);},[]);
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">{t('captchaDescription')}</p>{siteKey&&nonce?<HCaptcha siteKey={siteKey} onToken={token=>{if(token){window.ReactNativeWebView?.postMessage(JSON.stringify({nonce,token}));setComplete(true);}else setComplete(false);}}/>:nonce===undefined?<p role="status">{t('captchaLoading')}</p>:<p role="alert">{t('captchaUnavailable')}</p>}{complete&&<p role="status">{t('captchaComplete')}</p>}</div>;
}
