import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

/** Adds cookie CSRF proof and retains implicit mutation keys until a readable acknowledgement. */
export function browserFetch(original: typeof fetch, origin: string, cookie:()=>string, storage?:Storage,owner:()=>string=()=>'anonymous'): typeof fetch {
  const pending=new Map<string,{key:string;at:number}>();let actor=owner();
  const clean=(all=false)=>{try{const keys=Array.from({length:storage?.length??0},(_,index)=>storage?.key(index)).filter((key):key is string=>!!key&&key.startsWith('liravo:mutation:'));for(const key of keys){let record;try{record=JSON.parse(storage?.getItem(key)??'null');}catch{}if(all||!record?.at||Date.now()-record.at>86400000)storage?.removeItem(key);}const remaining=keys.filter(key=>!!storage?.getItem(key));while(remaining.length>=128)storage?.removeItem(remaining.shift()!);}catch{}};
  const clear=()=>{pending.clear();clean(true);};
  return async (input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),origin);
    const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(url.origin!==origin||!['POST','PUT','PATCH','DELETE'].includes(method))return original(input,init);
    const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
    const token=cookie().split('; ').find(value=>value.startsWith(`${CSRF_COOKIE}=`))?.slice(CSRF_COOKIE.length+1);
    if(token)headers.set(CSRF_HEADER,token);
    const current=headers.get('X-Liravo-Actor')??owner();if(current!==actor){clear();actor=current;}clean();
    for(const [key,value]of pending)if(Date.now()-value.at>86400000)pending.delete(key);
    let signature:string|undefined,ownedKey:string|undefined;
    const supplied=headers.get('Idempotency-Key')??headers.get('X-Idempotency-Key');
    if(supplied){headers.set('Idempotency-Key',supplied);headers.set('X-Idempotency-Key',supplied);}
    else if(url.pathname.startsWith('/api/')&&!/^\/api\/(auth|tips|earnings|subscriptions|payments|billing)(\/|$)/.test(url.pathname)){
      const body=init?.body??(input instanceof Request?(input.body===null?null:headers.get('Content-Type')?.includes('application/json')?await input.clone().text():input.body):undefined);
      const secret=typeof body==='string'&&/"(?:pin|currentPin|current_pin|newPin|password)"\s*:/i.test(body);
      if(!secret&&(body===undefined||body===null||typeof body==='string')){
        const bytes=new TextEncoder().encode(JSON.stringify([actor,method,url.pathname+url.search,body??null]));
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        signature='liravo:mutation:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
        let saved:{key?:string;at?:number}|null=null;try{saved=JSON.parse(storage?.getItem(signature)??'null');}catch{}
        ownedKey=pending.get(signature)?.key??(typeof saved?.key==='string'&&saved.key.length>=8&&saved.key.length<=200&&saved.at&&Date.now()-saved.at<=86400000?saved.key:undefined)??crypto.randomUUID();
        while(pending.size>=128)pending.delete(pending.keys().next().value!);
        const record={key:ownedKey,at:Date.now()};pending.set(signature,record);
        try{storage?.setItem(signature,JSON.stringify(record));}catch{}
        headers.set('Idempotency-Key',ownedKey);headers.set('X-Idempotency-Key',ownedKey);
      }
    }
    const response=await original(input,{...init,headers});
    if(url.pathname==='/api/auth/logout'&&response.ok)clear();
    if(signature&&ownedKey&&[400,401,403,404,405,410,413,415,422].includes(response.status)){pending.delete(signature);try{storage?.removeItem(signature);}catch{}}
    if(signature&&ownedKey&&response.ok){
      let acknowledged=response.status===204;
      if(response.headers.get('Content-Type')?.includes('application/json')){
        try{await response.clone().json();acknowledged=true;}catch{}
      }
      if(acknowledged&&pending.get(signature)?.key===ownedKey){pending.delete(signature);try{if(JSON.parse(storage?.getItem(signature)??'null')?.key===ownedKey)storage?.removeItem(signature);}catch{}}
    }
    return response;
  };
}

if(typeof window!=='undefined'){
  let storage:Storage|undefined;try{storage=window.sessionStorage;}catch{}
  window.fetch=browserFetch(window.fetch.bind(window),location.origin,()=>document.cookie,storage,()=>document.querySelector('[data-liravo-actor]')?.getAttribute('data-liravo-actor')??'anonymous');
}
