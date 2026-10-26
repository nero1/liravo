import { cron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { NextResponse } from 'next/server';
import { AI_MODELS } from '@/constants/ai';

export const dynamic = 'force-dynamic';

async function run() {

  const supabase = createServiceClient();
  const redis = getRedisClient();

  // Find premium users whose taste profile is > 30 days old or missing
  const { data: premiumUsers } = await supabase
    .from('users')
    .select('id')
    .eq('is_premium', true)
    .limit(50);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let processed = 0;
  let regenerated = 0;

  for (const u of premiumUsers ?? []) {
    processed++;

    const { data: existingProfile } = await supabase
      .from('ai_taste_profiles')
      .select('generated_at')
      .eq('user_id', u.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    const needsRefresh =
      !existingProfile || existingProfile.generated_at < thirtyDaysAgo;

    if (!needsRefresh) continue;

    // Gather reading data
    const { data: finishedBooks } = await supabase
      .from('shelf_books')
      .select('book_id')
      .eq('user_id', u.id)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(20);

    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating, mood_tags')
      .eq('user_id', u.id);

    let topGenres: string[] = [];
    let avgRating = 0;
    const moodTags: string[] = [];

    if (finishedBooks && finishedBooks.length > 0) {
      const bookIds = finishedBooks.map((b: { book_id: string }) => b.book_id);
      const { data: books } = await supabase
        .from('books')
        .select('genres')
        .in('id', bookIds);

      const genreCounts: Record<string, number> = {};
      for (const book of books ?? []) {
        for (const genre of (book as { genres: string[] }).genres ?? []) {
          genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
        }
      }
      topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);
    }

    if (reviews && reviews.length > 0) {
      const total = reviews.reduce(
        (acc: number, r: { rating: number }) => acc + r.rating,
        0
      );
      avgRating = Math.round((total / reviews.length) * 10) / 10;
      for (const r of reviews as { rating: number; mood_tags: string[] }[]) {
        for (const tag of r.mood_tags ?? []) {
          if (!moodTags.includes(tag)) moodTags.push(tag);
        }
      }
    }

    const prompt = `Based on these reading preferences, write a 150-word reader taste profile in second person.
Top genres: ${topGenres.join(', ') || 'varied'}.
Books finished recently: ${finishedBooks?.length ?? 0}.
Average rating given: ${avgRating}/5.
Preferred mood tags: ${moodTags.slice(0, 6).join(', ') || 'not specified'}.
Write in a warm, insightful tone.`;

    let profileText = '';

    try {
      const provider = AI_MODELS.PRIMARY_PROVIDER;
      if (provider === 'deepseek') {
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: AI_MODELS.DEEPSEEK_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 250,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
        profileText = data.choices?.[0]?.message?.content?.trim() ?? '';
      } else {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: AbortSignal.timeout(10000),
          }
        );
        const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        profileText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      }
    } catch {
      // Skip this user on error
      continue;
    }

    if (!profileText) continue;

    const generatedAt = new Date().toISOString();

    await supabase.from('ai_taste_profiles').upsert({
      user_id: u.id,
      profile_text: profileText,
      generated_at: generatedAt,
    });

    // Invalidate Redis cache
    await redis.del(`taste_profile:${u.id}`);

    regenerated++;
  }

  return NextResponse.json({ processed, regenerated });
}

export const GET = cron('taste-profiles', run);
export const POST = GET;

export const maxDuration = 60;
