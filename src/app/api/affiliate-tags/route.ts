import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 3600; // 1 hour

const QuerySchema = z.object({
  country: z.enum(['US', 'UK', 'CA', 'AU', 'FR', 'DE']),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const parsed = QuerySchema.safeParse({
    country: searchParams.get('country'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid country. Use US, UK, CA, AU, FR, or DE.' }, { status: 400 });
  }

  const { country } = parsed.data;
  const cacheKey = `affiliate_tag:${country}`;

  const redis = getRedisClient();
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json({ country, tag: cached, cached: true });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('affiliate_stores')
    .select('affiliate_tag')
    .eq('country', country)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ country, tag: null });
  }

  const tag: string = data.affiliate_tag ?? '';
  if (tag) {
    await redis.set(cacheKey, tag, { ex: CACHE_TTL });
  }

  return NextResponse.json({ country, tag });
}
