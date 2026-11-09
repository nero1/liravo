import {z} from 'zod';
import {APP_URL} from '@/constants/config';
import {createServiceClient} from '@/lib/supabase/server';
const partition=z.object({kind:z.enum(['books','authors','lists']),first:z.string().uuid(),until:z.string().uuid().nullable()}).refine(value=>!value.until||value.first<value.until);
const entry=z.object({id:z.string().uuid(),path:z.string().regex(/^\/(book\/[a-f0-9-]+|author\/[a-zA-Z0-9_]+|lists\/[a-f0-9-]+)$/),updated_at:z.string().datetime({offset:true})});
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
function xml(body:string,kind:'sitemapindex'|'urlset'){return new Response('<?xml version="1.0" encoding="UTF-8"?><'+kind+' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+body+'</'+kind+'>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=60, must-revalidate'}});}
const unavailable=()=>new Response('Sitemap unavailable',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
export async function sitemapIndex(page:number){
 if(!Number.isSafeInteger(page)||page<0||page>214748)return new Response('Not found',{status:404});
 try{
  const {data,error}=await createServiceClient().rpc('public_sitemap_partitions' as never,{p_page:page} as never),parsed=z.array(partition).max(5000).safeParse(data);
  if(error||!parsed.success)return unavailable();if(page>0&&!parsed.data.length)return new Response('Not found',{status:404});
  const paths=parsed.data.map(value=>'/sitemaps/'+Buffer.from(JSON.stringify(value)).toString('base64url')+'.xml');if(page===0)paths.unshift('/sitemaps/static.xml');
  return xml(paths.map(path=>'<sitemap><loc>'+escape(APP_URL+path)+'</loc></sitemap>').join(''),'sitemapindex');
 }catch{return unavailable();}
}
export async function sitemapPage(cursor:string){
 if(cursor==='static.xml')return xml('<url><loc>'+escape(APP_URL)+'</loc></url>','urlset');
 if(cursor.length>400||!cursor.endsWith('.xml'))return new Response('Not found',{status:404});
 let decoded:z.infer<typeof partition>;try{decoded=partition.parse(JSON.parse(Buffer.from(cursor.slice(0,-4),'base64url').toString()));}catch{return new Response('Not found',{status:404});}
 try{
  const {data,error}=await createServiceClient().rpc('public_sitemap_page' as never,{p_kind:decoded.kind,p_first:decoded.first,p_until:decoded.until} as never),parsed=z.array(entry).max(5000).safeParse(data);
  if(error||!parsed.success)return unavailable();
  return xml(parsed.data.map(value=>'<url><loc>'+escape(APP_URL+value.path)+'</loc><lastmod>'+escape(new Date(value.updated_at).toISOString())+'</lastmod></url>').join(''),'urlset');
 }catch{return unavailable();}
}
export async function sitemapIndexURLs(){
 const {data,error}=await createServiceClient().rpc('public_sitemap_partition_count' as never);
 if(error||typeof data!=='number'||!Number.isSafeInteger(data)||data<1||data>214749)throw new Error('Sitemap discovery unavailable');
 return Array.from({length:data},(_,index)=>APP_URL+(index===0?'/sitemap.xml':'/sitemap-index/'+index+'.xml'));
}
