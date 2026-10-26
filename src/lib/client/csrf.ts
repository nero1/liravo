import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

/** Adds cookie CSRF proof and retains implicit mutation keys until a readable acknowledgement. */
export function browserFetch(original: typeof fetch, origin: string, cookie:()=>string, storage?:Storage): typeof fetch {
  const pending=new Map<string,string>();
  return async (input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),origin);
    const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(url.origin!==origin||!['POST','PUT','PATCH','DELETE'].includes(method))return original(input,init);
    const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
    const token=cookie().split('; ').find(value=>value.startsWith(`${CSRF_COOKIE}=`))?.slice(CSRF_COOKIE.length+1);
    if(token)headers.set(CSRF_HEADER,token);
    let signature:string|undefined,ownedKey:string|undefined;
    const supplied=headers.get('Idempotency-Key')??headers.get('X-Idempotency-Key');
    if(supplied){headers.set('Idempotency-Key',supplied);headers.set('X-Idempotency-Key',supplied);}
    else if(url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/')){
      const body=init?.body??(input instanceof Request?(input.body===null?null:headers.get('Content-Type')?.includes('application/json')?await input.clone().text():input.body):undefined);
      if(body===undefined||body===null||typeof body==='string'){
        const bytes=new TextEncoder().encode(JSON.stringify([method,url.pathname+url.search,body??null]));
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        signature='liravo:mutation:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
        let saved:string|null=null;try{saved=storage?.getItem(signature)??null;}catch{}
        ownedKey=pending.get(signature)??saved??crypto.randomUUID();pending.set(signature,ownedKey);
        try{storage?.setItem(signature,ownedKey);}catch{}
        headers.set('Idempotency-Key',ownedKey);headers.set('X-Idempotency-Key',ownedKey);
      }
    }
    const response=await original(input,{...init,headers});
    if(signature&&ownedKey&&response.ok){
      let acknowledged=response.status===204;
      if(response.headers.get('Content-Type')?.includes('application/json')){
        try{await response.clone().json();acknowledged=true;}catch{}
      }
      if(acknowledged&&pending.get(signature)===ownedKey){pending.delete(signature);try{if(storage?.getItem(signature)===ownedKey)storage.removeItem(signature);}catch{}}
    }
    return response;
  };
}

if(typeof window!=='undefined'){
  let storage:Storage|undefined;try{storage=window.sessionStorage;}catch{}
  window.fetch=browserFetch(window.fetch.bind(window),location.origin,()=>document.cookie,storage);
}
