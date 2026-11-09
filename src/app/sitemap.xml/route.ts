import {sitemapIndex} from '@/lib/sitemaps';
export const dynamic='force-dynamic';
export async function GET(){return sitemapIndex(0);}
