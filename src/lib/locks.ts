import {AsyncLocalStorage} from 'node:async_hooks';
import {getRedisClient} from '@/lib/redis';
import crypto from 'node:crypto';

type Fence={name:string;owner:string;epoch:number};
type Lease={key:string;owner:string;signal:AbortSignal;assert:()=>Promise<void>;fence?:Fence};
const leases=new AsyncLocalStorage<Lease>();
export const leaseSignal=()=>leases.getStore()?.signal;
export const databaseFence=()=>leases.getStore()?.fence;
export async function assertLeaseOwned(){await leases.getStore()?.assert();}
export function withDatabaseFence<T>(fence:Fence,work:()=>Promise<T>){const lease=leases.getStore();if(!lease)throw new Error('Lease required');return leases.run({...lease,fence},work);}
async function bounded<T>(promise:Promise<T>,milliseconds=3000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Lease dependency deadline exceeded')),milliseconds);})]);}finally{clearTimeout(timer);}
}
export async function setLeaseCache(key:string,value:string,seconds:number){
 const redis=getRedisClient(),lease=leases.getStore();if(!lease)return redis.set(key,value,{ex:seconds});
 lease.signal.throwIfAborted();
 if(Number(await bounded(redis.setOwned(lease.key,lease.owner,key,value,seconds)))!==1)throw new Error('Lease ownership lost');
}
export async function withRedisLock<T>(key:string,ttlSeconds:number,task:()=>Promise<T>):Promise<T|null>{
 if(!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>3600)throw new Error('Invalid lease lifetime');
 const parent=leases.getStore();await parent?.assert();
 const redis=getRedisClient(),lockKey='lock:'+key,owner=crypto.randomUUID();
 if(!redis.setNxEx)throw new Error('Atomic leases unavailable');
 if(!await bounded(redis.setNxEx(lockKey,owner,ttlSeconds)))return null;
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(parent?[parent.signal]:[])]);let renewing=false,abort!:()=>void;
 const lost=()=>controller.abort(new Error('Lease ownership lost'));
 const assert=async()=>{signal.throwIfAborted();try{if(Number(await bounded(redis.compareExpire(lockKey,owner,ttlSeconds)))!==1)lost();}catch{lost();}signal.throwIfAborted();};
 const heartbeat=setInterval(()=>{if(renewing||signal.aborted)return;renewing=true;void assert().catch(lost).finally(()=>{renewing=false;});},Math.max(250,Math.min(5000,Math.floor(ttlSeconds*1000/3))));
 const timer=setTimeout(()=>controller.abort(new Error('Lease operation deadline exceeded')),Math.min(55000,ttlSeconds*4000));
 const aborted=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
 try{
  const result=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return leases.run({key:lockKey,owner,signal,assert,fence:parent?.fence},task);}),aborted]);
  await assert();return result;
 }finally{
  clearInterval(heartbeat);clearTimeout(timer);signal.removeEventListener('abort',abort);
  await bounded(redis.compareDelete(lockKey,owner),1000).catch(()=>{});
 }
}
