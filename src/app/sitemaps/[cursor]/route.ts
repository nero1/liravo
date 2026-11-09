import {sitemapPage} from '@/lib/sitemaps';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{cursor:string}}){return sitemapPage(params.cursor);}
