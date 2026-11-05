export class BodyError extends Error{constructor(public status:number,message:string){super(message);}}
export async function requestText(request:Request,limit=65536,timeoutMs=5000){
 const length=request.headers.get('content-length');if(length&&Number(length)>limit)throw new BodyError(413,'Payload too large');
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new BodyError(408,'Request timeout')),timeoutMs);});
 try{
  for(;;){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;if(size>limit)throw new BodyError(413,'Payload too large');chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function requestJson(request:Request,limit=65536){
 try{return JSON.parse(await requestText(request,limit)) as unknown;}catch(error){if(error instanceof BodyError)throw error;throw new BodyError(400,'Invalid JSON');}
}
