import { getRedisClient } from '@/lib/redis';
import { createServiceClient } from '@/lib/supabase/server';

const SPAM_LIMIT = 10;

export async function checkSpam(userId: string, contentType: string): Promise<boolean> {
  const redis = getRedisClient();
  const hourTimestamp = Math.floor(Date.now() / 3600000);
  const key = `spam:${userId}:${contentType}:${hourTimestamp}`;

  try {
    const count = await redis.incr(key);
    await redis.expire(key, 3600);

    if (count > SPAM_LIMIT) {
      // Auto-create a pending report for spam
      try {
        const supabase = createServiceClient();
        await supabase
          .from('content_reports')
          .insert({
            reporter_id: userId, // Self-reported by system — best we can do without a system user
            entity_type: 'user',
            entity_id: userId,
            reason: `Automated spam detection: user exceeded ${SPAM_LIMIT} ${contentType} submissions in an hour.`,
            status: 'pending',
          });
      } catch {
        // Non-critical — ignore DB errors
      }

      return true;
    }

    return false;
  } catch {
    // Redis unavailable — fail open (allow the action)
    return false;
  }
}
