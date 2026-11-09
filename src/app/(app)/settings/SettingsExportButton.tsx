'use client';
import {useState}from'react';
import {useTranslations}from'next-intl';
import {Download,ChevronRight}from'lucide-react';
import {CSRF_COOKIE,CSRF_HEADER}from'@/lib/csrf';

type Chunk={actorId:string;jobId:string;text:string;nextCursor:string|null;complete:boolean};
export function SettingsExportButton({actorId,format,label,description}:{actorId:string;format:'json'|'csv';label:string;description:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(false),t=useTranslations('accountData');
 async function download(){
  setBusy(true);setError(false);let port:MessagePort|undefined,frame:HTMLIFrameElement|undefined;
  try{
   if(!('serviceWorker'in navigator))throw Error('Download unavailable');
   await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
   if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{const ready=()=>{clearTimeout(timeout);resolve();},timeout=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',ready);reject(Error('Download unavailable'));},10000);navigator.serviceWorker.addEventListener('controllerchange',ready,{once:true});});
   const worker=navigator.serviceWorker.controller;if(!worker)throw Error('Download unavailable');
   const csrf=document.cookie.split('; ').find(value=>value.startsWith(CSRF_COOKIE+'='))?.slice(CSRF_COOKIE.length+1)??'';
   const response=await fetch('/api/users/export',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),'X-Liravo-Actor':actorId,[CSRF_HEADER]:decodeURIComponent(csrf)},body:JSON.stringify({format})});
   const job=await response.json()as{actorId:string;jobId:string;cursor:string;filename:string};if(!response.ok||!job.cursor||job.actorId!==actorId)throw Error('Export unavailable');
   let cursor:string|null=job.cursor,closed=false;const channel=new MessageChannel();port=channel.port1;
   await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Download registration timed out')),10000);
    channel.port1.onmessage=event=>{if(event.data?.type==='ready'){clearTimeout(timeout);resolve();}};
    worker.postMessage({type:'LIRAVO_EXPORT',id:crypto.randomUUID(),filename:job.filename,format},[channel.port2]);
   });
   await new Promise<void>((resolve,reject)=>{
    let timeout:ReturnType<typeof setTimeout>;const reset=()=>{clearTimeout(timeout);timeout=setTimeout(()=>{channel.port1.postMessage({type:'error'});reject(Error('Download interrupted'));},180000);};reset();
    channel.port1.onmessage=async event=>{
     if(event.data?.type==='url'){frame=document.createElement('iframe');frame.hidden=true;frame.src=event.data.url;document.body.append(frame);return;}
     if(event.data?.type==='complete'){clearTimeout(timeout);resolve();return;}
     if(event.data?.type==='cancel'){clearTimeout(timeout);reject(Error('Download cancelled'));return;}
     if(event.data?.type!=='pull'||closed)return;reset();
     try{
      if(!cursor){closed=true;channel.port1.postMessage({type:'end'});return;}
      let page:Response|undefined;
      for(let attempt=0;attempt<3;attempt++){try{page=await fetch('/api/users/export?cursor='+encodeURIComponent(cursor),{cache:'no-store',signal:AbortSignal.timeout(25000)});if(page.ok||![429,502,503,504].includes(page.status))break;if(attempt===2)throw Error('Export unavailable');await new Promise(resolve=>setTimeout(resolve,page!.status===429?Math.min(120,Math.max(1,Number(page!.headers.get('Retry-After'))||60))*1000:1000*(attempt+1)));}catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}}
      if(!page)throw Error('Export unavailable');const chunk=await page.json()as Chunk;
      if(!page.ok||chunk.actorId!==job.actorId||chunk.jobId!==job.jobId||typeof chunk.text!=='string'||chunk.text.length>2000000||chunk.nextCursor!==null&&(typeof chunk.nextCursor!=='string'||!chunk.nextCursor||chunk.nextCursor===cursor)||chunk.complete!==(chunk.nextCursor===null))throw Error('Invalid export chunk');
      cursor=chunk.nextCursor;const bytes=new TextEncoder().encode(chunk.text);channel.port1.postMessage({type:'chunk',bytes},[bytes.buffer]);reset();
     }catch(error){closed=true;channel.port1.postMessage({type:'error'});clearTimeout(timeout);reject(error);}
    };
    channel.port1.postMessage({type:'download'});
   });
  }catch{setError(true);}finally{port?.close();frame?.remove();setBusy(false);}
 }
 return <div><button disabled={busy} onClick={()=>void download()} className="w-full flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-60"><span className="flex items-center gap-3"><Download size={18} className="text-muted-foreground"/><span className="text-left"><span className="block font-medium text-sm">{busy?t('exporting'):label}</span><span className="block text-xs text-muted-foreground">{description}</span></span></span><ChevronRight size={16} className="text-muted-foreground"/></button>{error&&<p role="alert" className="text-xs text-destructive">{t('exportFailed')}</p>}</div>;
}
