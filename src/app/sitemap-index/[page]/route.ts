import {sitemapIndex} from '@/lib/sitemaps';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{page:string}}){
 if(!/^\d+\.xml$/.test(params.page))return new Response('Not found',{status:404});
 return sitemapIndex(Number(params.page.slice(0,-4)));
}
