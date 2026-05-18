import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Premium check
  const { data: profile } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single();
  const isPremium = (profile as { is_premium?: boolean } | null)?.is_premium ?? false;
  if (!isPremium) {
    return NextResponse.json({ error: 'Premium required' }, { status: 403 });
  }

  const redis = getRedisClient();
  const cacheKey = `taste_profile:${user.id}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached) as { profile: string; generatedAt: string };
    return NextResponse.json(parsed);
  }

  // Gather reading data
  const { data: finishedBooks } = await supabase
    .from('shelf_books')
    .select('book_id')
    .eq('user_id', user.id)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(20);

  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating, mood_tags')
    .eq('user_id', user.id);

  let topGenres: string[] = [];
  let avgRating = 0;
  const moodTags: string[] = [];

  if (finishedBooks && finishedBooks.length > 0) {
    const bookIds = finishedBooks.map((b) => b.book_id);
    const { data: books } = await supabase
      .from('books')
      .select('genres, title')
      .in('id', bookIds);

    const genreCounts: Record<string, number> = {};
    for (const book of books ?? []) {
      for (const genre of book.genres ?? []) {
        genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
      }
    }
    topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);
  }

  if (reviews && reviews.length > 0) {
    const total = reviews.reduce((acc, r) => acc + r.rating, 0);
    avgRating = Math.round((total / reviews.length) * 10) / 10;
    for (const r of reviews) {
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
Write in a warm, insightful tone. Focus on what kind of stories this reader gravitates toward.`;

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
    // Fallback: generate a simple profile
    profileText = `You gravitate toward ${topGenres[0] ?? 'diverse'} reads with an eye for quality — your average rating of ${avgRating} out of 5 shows you're a discerning reader. You enjoy books that feel ${moodTags[0] ?? 'engaging'}, and you've cultivated a well-rounded literary taste across multiple genres. Keep exploring — your next favourite book is out there.`;
  }

  if (!profileText) {
    profileText = `Your reading taste is wonderfully eclectic. You engage deeply with books across genres, bringing thoughtful ratings and a keen sense for what makes a story resonate. You're the kind of reader authors love — attentive, thoughtful, and genuinely passionate about literature.`;
  }

  const generatedAt = new Date().toISOString();

  // Store in DB
  await supabase.from('ai_taste_profiles').upsert({
    user_id: user.id,
    profile_text: profileText,
    generated_at: generatedAt,
  });

  // Cache in Redis 24h
  const result = { profile: profileText, generatedAt };
  await redis.set(cacheKey, JSON.stringify(result), { ex: 86400 });

  // For form submissions, redirect back
  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/taste-profile' },
    });
  }

  return NextResponse.json(result);
}
