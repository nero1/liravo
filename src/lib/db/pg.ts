import {AsyncLocalStorage} from 'node:async_hooks';
import postgres from 'postgres';
import {leaseSignal,databaseFence} from '@/lib/locks';

type SqlInstance=ReturnType<typeof postgres>;
type Query=PromiseLike<unknown>&{cancel?:()=>unknown};
type DatabaseScope={sql:SqlInstance;signal:AbortSignal;queries:Set<Query>};
const scope=new AsyncLocalStorage<DatabaseScope>();
let pool:SqlInstance|null=null,active=0;
const waiting:Array<()=>void>=[];
function setting(name:string,fallback:number,min:number,max:number){
 const raw=process.env[name];if(raw===undefined)return fallback;
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<min||Number(raw)>max)throw new Error(name+' is outside its supported range');
 return Number(raw);
}
export function databaseLimits(){return {
 max:setting('DATABASE_POOL_MAX',5,1,20),queryMs:setting('DATABASE_QUERY_TIMEOUT_MS',15000,100,30000),lockMs:setting('DATABASE_LOCK_TIMEOUT_MS',1000,50,5000),queueMs:setting('DATABASE_QUEUE_TIMEOUT_MS',1000,50,5000),queueMax:setting('DATABASE_QUEUE_MAX',20,0,100),
};}
function getPool():SqlInstance{
 if(pool)return pool;
 const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL is required in direct PostgreSQL mode (digitalocean or railway)');
 const limits=databaseLimits();
 pool=postgres(url,{prepare: false,max:limits.max,idle_timeout:20,max_lifetime:1800,connect_timeout:5,ssl:process.env.DATABASE_SSL!=='false'?{rejectUnauthorized:true}:false,
  connection:{statement_timeout:limits.queryMs,lock_timeout:Math.min(limits.lockMs,limits.queryMs),idle_in_transaction_session_timeout:limits.queryMs},
  types:{timestamptz:{to:1184,from:[1184],serialize:(value:string|Date)=>value instanceof Date?value.toISOString():value,parse:(value:string)=>value.replace(' ','T').replace(/([+-]\d{2})$/,'$1:00')}},
 });return pool;
}
async function acquire(){
 const limits=databaseLimits();if(active<limits.max){active++;return;}
 if(waiting.length>=limits.queueMax)throw new Error('Database queue full');
 await new Promise<void>((resolve,reject)=>{
  const enter=()=>{clearTimeout(timer);resolve();};
  const timer=setTimeout(()=>{const index=waiting.indexOf(enter);if(index>=0)waiting.splice(index,1);reject(new Error('Database queue deadline exceeded'));},limits.queueMs);
  waiting.push(enter);
 });
}
function release(){const next=waiting.shift();if(next)next();else active--;}
export function getSql():SqlInstance{
 const current=scope.getStore();if(current){current.signal.throwIfAborted();return current.sql;}return getPool();
}
export async function executeQuery<T>(query:PromiseLike<T>&{cancel?:()=>unknown}):Promise<T>{
 const current=scope.getStore();if(!current)return await query;
 current.signal.throwIfAborted();current.queries.add(query);
 try{return await query;}finally{current.queries.delete(query);}
}
export async function withDatabaseOperation<T>(work:()=>Promise<T>):Promise<T>{
 const inherited=scope.getStore();if(inherited){inherited.signal.throwIfAborted();return work();}
 leaseSignal()?.throwIfAborted();
 await acquire();const controller=new AbortController(),queries=new Set<Query>(),limits=databaseLimits();
 const lease=leaseSignal();const signals=AbortSignal.any([controller.signal,...(lease?[lease]:[])]);
 const timer=setTimeout(()=>controller.abort(new Error('Database operation deadline exceeded')),limits.queryMs+5000);
 const cancel=()=>{for(const query of queries)try{void Promise.resolve(query.cancel?.()).catch(()=>{});}catch{}};
 signals.addEventListener('abort',cancel,{once:true});
 try{return await getPool().begin(async tx=>{
  signals.throwIfAborted();const fence=databaseFence();if(fence)await tx`select set_config('liravo.maintenance',${JSON.stringify(fence)},true),public.check_maintenance_lease(${fence.name},${fence.owner},${fence.epoch})`;signals.throwIfAborted();
  let abort!:()=>void;
  const deadline=new Promise<never>((_,reject)=>{abort=()=>reject(signals.reason);if(signals.aborted)abort();else signals.addEventListener('abort',abort,{once:true});});
  try{return await scope.run({sql:tx as unknown as SqlInstance,signal:signals,queries},()=>Promise.race([work(),deadline]));}finally{signals.removeEventListener('abort',abort);}
 })as T;}finally{clearTimeout(timer);signals.removeEventListener('abort',cancel);release();}
}
export async function withUserContext<T>(userId:string,work:()=>Promise<T>):Promise<T>{
 return withDatabaseOperation(async()=>{await executeQuery(getSql()`SELECT set_config('app.current_user_id',${userId},true)`);return work();});
}
