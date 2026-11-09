import {sitemapPage} from '@/lib/sitemaps';
export const dynamic='force-dynamic';
export async function GET(_request:Request, props:{params: Promise<{cursor:string}>}) {
  const params = await props.params;
  return sitemapPage(params.cursor);
}
