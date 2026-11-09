import type {MetadataRoute} from 'next';
import {sitemapIndexURLs} from '@/lib/sitemaps';
export const dynamic='force-dynamic';
export default async function robots():Promise<MetadataRoute.Robots>{
 return {rules:{userAgent:'*',allow:'/',disallow:['/admin/','/api/','/onboarding','/settings/']},sitemap:await sitemapIndexURLs()};
}
