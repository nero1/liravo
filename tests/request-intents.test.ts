import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { useRequestIntent } from '@/lib/client/useRequestIntent';

vi.mock('react',()=>({useRef:(value:unknown)=>({current:value})}));

it('retains failed-request keys independently when two controls submit concurrently',()=>{
  const intents=useRequestIntent();
  const first=intents.headers({voted:true},'first-entry');
  const second=intents.headers({voted:true},'second-entry');
  expect(first).not.toEqual(second);
  expect(intents.headers({voted:true},'first-entry')).toEqual(first);
  intents.complete('second-entry');
  expect(intents.headers({voted:true},'first-entry')).toEqual(first);
  expect(intents.headers({voted:true},'second-entry')).not.toEqual(second);
});

it('rotates a key only after acknowledgement or a changed payload',()=>{
  const intents=useRequestIntent();
  const initial=intents.headers({content:'First draft'});
  expect(intents.headers({content:'First draft'})).toEqual(initial);
  const edited=intents.headers({content:'Edited draft'});
  expect(edited).not.toEqual(initial);
  intents.complete();
  expect(intents.headers({content:'Edited draft'})).not.toEqual(edited);
});

it('recovers owned persisted keys without creating a request and preserves newer intents',async()=>{
  const values=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  try{const first=useRequestIntent('owner'),headers=await first.durableHeaders({reason:'Original reason'},'appeal');const resumed=useRequestIntent('owner');expect(await resumed.pending('appeal')).toEqual(headers);expect(await useRequestIntent('other').pending('appeal')).toBeNull();resumed.complete('appeal','foreign-key');expect(await useRequestIntent('owner').pending('appeal')).toEqual(headers);const newer=await resumed.durableHeaders({reason:'Changed reason'},'appeal');resumed.complete('appeal',headers['Idempotency-Key']);expect(await useRequestIntent('owner').pending('appeal')).toEqual(newer);const acknowledged=useRequestIntent('owner');await acknowledged.pending('appeal');acknowledged.complete('appeal',newer['Idempotency-Key']);expect(await useRequestIntent('owner').pending('appeal')).toBeNull();}finally{vi.unstubAllGlobals();}
});

it('recovers native SecureStore receipts across remounts without clearing a newer request',async()=>{
  const values=new Map<string,string>(),code=ts.transpileModule(readFileSync('mobile/hooks/useRequestIntent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  function mount(owner='owner'){const exports:any={};runInNewContext(code,{exports,require:(id:string)=>id==='react'?{useRef:(value:unknown)=>({current:value})}:id==='expo-crypto'?{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_:string,value:string)=>createHash('sha256').update(value).digest('hex')}:{getItemAsync:async(key:string)=>values.get(key)??null,setItemAsync:async(key:string,value:string)=>values.set(key,value),deleteItemAsync:async(key:string)=>values.delete(key)}});return exports.useRequestIntent(owner);}
  const first=mount(),headers=await first.durableHeaders({reason:'Original'},'appeal'),resumed=mount();expect(await resumed.pending('appeal')).toEqual(headers);expect(await mount('other').pending('appeal')).toBeNull();const next=await resumed.durableHeaders({reason:'Changed'},'appeal');await resumed.complete('appeal',headers['Idempotency-Key']);expect(await mount().pending('appeal')).toEqual(next);const acknowledged=mount();await acknowledged.pending('appeal');await acknowledged.complete('appeal',next['Idempotency-Key']);expect(await mount().pending('appeal')).toBeNull();
});
