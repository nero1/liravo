import { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: APP_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${APP_URL}/discover`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
  ];

  // Book pages
  const { data: books } = await supabase
    .from('books')
    .select('id, updated_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  const bookRoutes: MetadataRoute.Sitemap = (books ?? []).map((b) => ({
    url: `${APP_URL}/book/${b.id}`,
    lastModified: b.updated_at ? new Date(b.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Author profiles (verified authors only)
  const { data: authors } = await supabase
    .from('users')
    .select('username, updated_at')
    .eq('is_verified_author', true)
    .limit(2000);

  const authorRoutes: MetadataRoute.Sitemap = (authors ?? []).map((a) => ({
    url: `${APP_URL}/user/${a.username}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Public reading lists
  const { data: lists } = await supabase
    .from('reading_lists')
    .select('id, updated_at')
    .eq('is_public', true)
    .limit(2000);

  const listRoutes: MetadataRoute.Sitemap = (lists ?? []).map((l) => ({
    url: `${APP_URL}/lists/${l.id}`,
    lastModified: l.updated_at ? new Date(l.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...bookRoutes, ...authorRoutes, ...listRoutes];
}
