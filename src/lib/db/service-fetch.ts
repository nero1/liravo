import {databaseFence,leaseSignal} from '@/lib/locks';

export const serviceFetch:typeof fetch=async(input,init)=>{
 const original=input instanceof Request?input:undefined,url=new URL(original?.url??String(input)),headers=new Headers(init?.headers??original?.headers),fence=databaseFence(),lease=leaseSignal();
 const signals=[AbortSignal.timeout(20000),...(init?.signal?[init.signal]:original?[original.signal]:[]),...(lease?[lease]:[])];
 let target=url.toString(),body=init?.body;
 if(fence){
  headers.set('x-liravo-maintenance',JSON.stringify(fence));
  if(url.pathname.includes('/rest/v1/rpc/')&&(init?.method??original?.method??'GET').toUpperCase()==='POST'){
   const fn=url.pathname.split('/').at(-1)!;if(!/^[a-z_][a-z0-9_]*$/.test(fn))throw new Error('Invalid job operation');
   const raw=typeof body==='string'?body:await original?.clone().text();
   if(!raw||raw.length>1048576)throw new Error('Invalid job arguments');
   url.pathname=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1)+'run_maintenance_rpc';target=url.toString();
   body=JSON.stringify({p_name:fence.name,p_owner:fence.owner,p_epoch:fence.epoch,p_function:fn,p_args:JSON.parse(raw)});
  }
 }
 const signal=AbortSignal.any(signals);signal.throwIfAborted();
 return fetch(original&&target===original.url?original:target,{...init,method:init?.method??original?.method,headers,body,signal});
};
