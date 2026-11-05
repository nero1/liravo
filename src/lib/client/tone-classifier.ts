export type ClientToneResult='safe'|'warning'|'toxic'|'unavailable';
type Score={label:string;score:number};
let pipeline:((text:string)=>Promise<Score[]>)|null=null,loading:Promise<void>|null=null,retryAfter=0;
async function loadPipeline(){
 if(pipeline||Date.now()<retryAfter)return;
 if(!loading)loading=(async()=>{
  try{
   const {pipeline:createPipeline,env}=await import('@huggingface/transformers');env.allowLocalModels=false;
   const model=await createPipeline('text-classification','Xenova/toxic-bert',{device:'wasm'});
   pipeline=async text=>await model(text,{top_k:6}) as Score[];
  }catch{retryAfter=Date.now()+60000;}finally{loading=null;}
 })();
 await loading;
}
export async function classifyReviewTone(text:string):Promise<ClientToneResult>{
 if(typeof window==='undefined'||text.trim().length<10)return 'unavailable';
 await loadPipeline();if(!pipeline)return 'unavailable';
 try{
  const scores=await pipeline(text.slice(0,512)),known=scores.filter(value=>['toxic','severe_toxic','obscene','threat','insult','identity_hate'].includes(value.label.toLowerCase())&&Number.isFinite(value.score)&&value.score>=0&&value.score<=1);
  if(!known.length)return 'unavailable';
  const score=Math.max(...known.map(value=>value.score));return score>0.85?'toxic':score>0.5?'warning':'safe';
 }catch{return 'unavailable';}
}
