'use client';

import {useRef} from 'react';

const serialize=(payload:unknown)=>JSON.stringify(payload,(key,value)=>/^(pin|currentPin|current_pin|newPin|password)$/i.test(key)?undefined:value);
export function useRequestIntent(ownerId?:string){
  const current=useRef(new Map<string,{payload:string;key:string}>()),actor=useRef(ownerId);
  if(actor.current!==ownerId){current.current.clear();actor.current=ownerId;}
  const storageKey=(scope:string)=>`liravo:financial-intent:${ownerId}:${scope}`;
  const headers=(payload:unknown,scope='default')=>{
    const serialized=serialize(payload);
    if(current.current.get(scope)?.payload!==serialized)current.current.set(scope,{payload:serialized,key:crypto.randomUUID()});
    return {'Idempotency-Key':current.current.get(scope)!.key};
  };
  return {
    headers,
    async durableHeaders(payload:unknown,scope='default'){
      if(!ownerId)return headers(payload,scope);
      const serialized=serialize(payload),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
      if(actor.current!==ownerId)throw new Error('Account changed');
      const fingerprint=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
      try{
        const saved=JSON.parse(sessionStorage.getItem(storageKey(scope))??'null');
        if(saved?.fingerprint===fingerprint&&typeof saved.key==='string'&&saved.key.length>=8&&saved.key.length<=200)current.current.set(scope,{payload:serialized,key:saved.key});
        const result=headers(payload,scope);sessionStorage.setItem(storageKey(scope),JSON.stringify({fingerprint,key:result['Idempotency-Key']}));return {...result,'X-Liravo-Actor':ownerId};
      }catch{return {...headers(payload,scope),'X-Liravo-Actor':ownerId};}
    },
    async pending(scope='default'){
      if(!ownerId)return null;
      try{const saved=JSON.parse(sessionStorage.getItem(storageKey(scope))??'null'),entry=current.current.get(scope);if(!entry&&(typeof saved?.key!=='string'||saved.key.length<8||saved.key.length>200))return null;const key=entry?.key??saved.key;if(!entry)current.current.set(scope,{payload:'',key});return {'Idempotency-Key':key,'X-Liravo-Actor':ownerId};}catch{return null;}
    },
    complete(scope='default',acknowledgedKey?:string){
      if(acknowledgedKey&&current.current.get(scope)?.key!==acknowledgedKey)return;
      if(ownerId)try{const saved=JSON.parse(sessionStorage.getItem(storageKey(scope))??'null');if(saved?.key===current.current.get(scope)?.key)sessionStorage.removeItem(storageKey(scope));}catch{}
      current.current.delete(scope);
    },
  };
}
