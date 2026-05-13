import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient, REDIS_KEYS, REDIS_TTL } from '@/lib/redis';
import { FEATURE_FLAGS } from '@/constants/config';

export async function getFeatureFlag(flagName: string): Promise<boolean> {
  const redis = getRedisClient();
  const cacheKey = REDIS_KEYS.featureFlag(flagName);

  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === 'true';

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('name', flagName)
      .single();

    const enabled = data?.enabled ?? true;
    await redis.set(cacheKey, String(enabled), { ex: REDIS_TTL.FEATURE_FLAG });
    return enabled;
  } catch {
    return true;
  }
}

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('feature_flags').select('name, enabled');
    return Object.fromEntries((data ?? []).map((f) => [f.name, f.enabled]));
  } catch {
    return Object.fromEntries(Object.values(FEATURE_FLAGS).map((f) => [f, true]));
  }
}

export async function invalidateFeatureFlag(flagName: string) {
  const redis = getRedisClient();
  await redis.del(REDIS_KEYS.featureFlag(flagName));
}
