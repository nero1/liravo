import * as Crypto from 'expo-crypto';
import {useRef} from 'react';
import * as SecureStore from 'expo-secure-store';

const serialize=(payload:unknown)=>JSON.stringify(payload,(key,value)=>/^(pin|currentPin|current_pin|newPin|password)$/i.test(key)?undefined:value);
export function useRequestIntent(ownerId:string|undefined){
  const current=useRef(new Map<string,{payload:string;key:string}>()),actor=useRef(ownerId);
  if(actor.current!==ownerId){current.current.clear();actor.current=ownerId;}
  const storageKey=(scope:string)=>`financial.${ownerId}.${scope.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  return {
    async durableHeaders(payload:unknown,scope='default'){
      if(!ownerId)throw new Error('Authenticated owner required');
      const serialized=serialize(payload),fingerprint=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,serialized);
      if(actor.current!==ownerId)throw new Error('Account changed');
      const saved=JSON.parse(await SecureStore.getItemAsync(storageKey(scope))??'null');
      if(actor.current!==ownerId)throw new Error('Account changed');
      if((saved?.fingerprint===fingerprint||saved?.payload===serialized)&&typeof saved.key==='string'&&saved.key.length>=8&&saved.key.length<=200)current.current.set(scope,{payload:serialized,key:saved.key});
      if(current.current.get(scope)?.payload!==serialized)current.current.set(scope,{payload:serialized,key:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2)});
      const entry=current.current.get(scope)!;
      await SecureStore.setItemAsync(storageKey(scope),JSON.stringify({fingerprint,key:entry.key}));
      if(actor.current!==ownerId)throw new Error('Account changed');
      if(current.current.get(scope)?.key!==entry.key)throw new Error('Intent changed');
      return {'Idempotency-Key':entry.key,'X-Liravo-Actor':ownerId};
    },
    async complete(scope='default'){
      try{const saved=JSON.parse(await SecureStore.getItemAsync(storageKey(scope))??'null');if(saved?.key===current.current.get(scope)?.key)await SecureStore.deleteItemAsync(storageKey(scope));}catch{}
      current.current.delete(scope);
    },
  };
}
