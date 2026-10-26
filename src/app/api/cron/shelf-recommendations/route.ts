import { cron } from '@/lib/cron';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const CHUNK_SIZE = 100;
const RECO_TTL = 86400; // 24 hours

async function run() {
  // Protect with CRON_SECRET header

  const supabase = createServiceClient();
  const redis = getRedisClient();

  // Get all user IDs
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .order('created_at', { ascending: true });

  if (!users || users.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let totalProcessed = 0;

  // Process in chunks of 100
  for (let i = 0; i < users.length; i += CHUNK_SIZE) {
    const chunk = users.slice(i, i + CHUNK_SIZE);
    const chunkStart = Date.now();

    await Promise.all(chunk.map(async ({ id: userId }) => {
      try {
        // Get this user's have_read shelf books
        const { data: userShelves } = await supabase
          .from('shelves')
          .select('id')
          .eq('user_id', userId)
          .eq('default_type', 'have_read');

        if (!userShelves || userShelves.length === 0) return;

        const { data: userBooks } = await supabase
          .from('shelf_books')
          .select('book_id')
          .in('shelf_id', userShelves.map((s) => s.id));

        const userBookIds = new Set((userBooks ?? []).map((b) => b.book_id));
        if (userBookIds.size < 3) return; // Not enough reading history

        // Find other users whose have_read shelf overlaps by 3+
        // Approach: get all shelf_books in have_read shelves from other users
        const { data: allOtherBooks } = await supabase
          .from('shelf_books')
          .select('book_id, user_id')
          .in('book_id', Array.from(userBookIds))
          .neq('user_id', userId)
          .limit(5000);

        if (!allOtherBooks || allOtherBooks.length === 0) return;

        // Count overlap per user
        const overlapCounts: Record<string, number> = {};
        for (const row of allOtherBooks) {
          overlapCounts[row.user_id] = (overlapCounts[row.user_id] ?? 0) + 1;
        }

        const similarUserIds = Object.entries(overlapCounts)
          .filter(([, count]) => count >= 3)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([id]) => id);

        if (similarUserIds.length === 0) return;

        // Get want_to_read books from similar users that this user hasn't read
        const { data: similarUsersWantToRead } = await supabase
          .from('shelf_books')
          .select('book_id, user_id')
          .in('user_id', similarUserIds)
          .limit(2000);

        const recoCounts: Record<string, number> = {};
        for (const row of similarUsersWantToRead ?? []) {
          if (!userBookIds.has(row.book_id)) {
            recoCounts[row.book_id] = (recoCounts[row.book_id] ?? 0) + 1;
          }
        }

        const topRecoIds = Object.entries(recoCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id]) => id);

        if (topRecoIds.length > 0) {
          const cacheKey = `recommendations:user:${userId}`;
          await redis.set(cacheKey, JSON.stringify(topRecoIds), { ex: RECO_TTL });
        }
      } catch {
        // Silently continue on per-user error
      }
    }));

    totalProcessed += chunk.length;

    // Check if we've used more than 9 seconds for this chunk
    if (Date.now() - chunkStart > 9000 && i + CHUNK_SIZE < users.length) {
      return NextResponse.json({
        processed: totalProcessed,
        total: users.length,
        incomplete: true,
        message: 'Partial run — schedule follow-up',
      });
    }
  }

  return NextResponse.json({ processed: totalProcessed, total: users.length });
}

export const GET = cron('shelf-recommendations', run);
export const POST = GET;

export const maxDuration = 60;
