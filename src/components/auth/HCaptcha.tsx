'use client';

import {useEffect,useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';

declare global{interface Window{
  hcaptcha?:{render:(element:HTMLElement,options:Record<string,unknown>)=>string|number;remove:(id:string|number)=>void};
  liravoCaptchaLoaded?:()=>void;
}}
let scriptReady:Promise<void>|null=null;
function loadCaptcha(){
  if(window.hcaptcha?.render)return Promise.resolve();
  if(scriptReady)return scriptReady;
  scriptReady=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');let settled=false;
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){script.remove();scriptReady=null;reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(new Error('Captcha unavailable')),10000);
    window.liravoCaptchaLoaded=()=>finish(window.hcaptcha?.render?undefined:new Error('Captcha unavailable'));
    script.src='https://js.hcaptcha.com/1/api.js?render=explicit&onload=liravoCaptchaLoaded';script.async=true;script.onerror=()=>finish(new Error('Captcha unavailable'));document.head.appendChild(script);
  });
  return scriptReady;
}
export function HCaptcha({siteKey,onToken}:{siteKey:string;onToken:(token:string|null)=>void}){
  const t=useTranslations('auth'),locale=useLocale(),container=useRef<HTMLDivElement>(null),callback=useRef(onToken);callback.current=onToken;
  const [failed,setFailed]=useState(false),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true,id:string|number|undefined;setFailed(false);setLoading(true);callback.current(null);
    void loadCaptcha().then(()=>{
      if(!active||!container.current)return;
      id=window.hcaptcha!.render(container.current,{sitekey:siteKey,hl:locale,callback:(token:unknown)=>{if(active&&typeof token==='string'&&token.length>0&&token.length<=8192){setFailed(false);callback.current(token);}},'expired-callback':()=>{if(active)callback.current(null);},'error-callback':()=>{if(active){callback.current(null);setFailed(true);}}});setLoading(false);
    }).catch(()=>{if(active){setLoading(false);setFailed(true);}});
    return()=>{active=false;callback.current(null);if(id!==undefined)try{window.hcaptcha?.remove(id);}catch{}};
  },[siteKey,locale,retry]);
  return <div className="space-y-2"><div ref={container} aria-label={t('captchaTitle')}/>{loading&&<p role="status" className="text-sm">{t('captchaLoading')}</p>}{failed&&<><p role="alert" className="text-sm text-destructive">{t('captchaUnavailable')}</p><button type="button" className="text-sm text-accent" onClick={()=>setRetry(value=>value+1)}>{t('captchaRetry')}</button></>}</div>;
}
