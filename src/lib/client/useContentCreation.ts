'use client';
import {useState,useRef,useEffect,useCallback} from 'react';
import {useRequestIntent} from './useRequestIntent';
export function useContentCreation<T>(actorId:string,path:string,scope:string,valid:(value:unknown)=>value is T,onSuccess:(value:T)=>void){
 const intent=useRequestIntent(actorId),latest=useRef({intent,valid,onSuccess});latest.current={intent,valid,onSuccess};
 const[checking,setChecking]=useState(true),[saving,setSaving]=useState(false),[failed,setFailed]=useState(false),lock=useRef(false),alive=useRef(true);
 const receipt=useCallback(async(key:string)=>{const response=await fetch(path+'?'+new URLSearchParams({receipt:key}),{cache:'no-store',headers:{'X-Liravo-Actor':actorId}});if(response.status===404)return null;const value=await response.json();if(!response.ok||!latest.current.valid(value))throw Error();return value;},[path,actorId]);
 const acknowledge=useCallback((value:T,key:string)=>{if(!alive.current)return;latest.current.intent.complete(scope,key);latest.current.onSuccess(value);},[scope]);
 const recover=useCallback(async()=>{setChecking(true);setFailed(false);try{const headers=await latest.current.intent.pending(scope);if(headers){const value=await receipt(headers['Idempotency-Key']);if(value)acknowledge(value,headers['Idempotency-Key']);}if(alive.current)setChecking(false);}catch{if(alive.current)setFailed(true);}},[scope,receipt,acknowledge]);
 useEffect(()=>{alive.current=true;void recover();return()=>{alive.current=false;};},[recover]);
 async function submit(body:Record<string,unknown>){
  if(lock.current||checking)return;lock.current=true;setSaving(true);setFailed(false);
  try{const headers=await intent.durableHeaders(body,scope);let value:T;
   try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),data=await response.json();if(!response.ok||!latest.current.valid(data))throw Error();value=data;}
   catch{const recovered=await receipt(headers['Idempotency-Key']);if(!recovered)throw Error();value=recovered;}
   acknowledge(value,headers['Idempotency-Key']);
  }catch{if(alive.current)setFailed(true);}finally{lock.current=false;if(alive.current)setSaving(false);}
 }
 return{submit,checking,saving,failed,recover};
}
