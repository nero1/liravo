import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient, REDIS_KEYS, REDIS_TTL } from '@/lib/redis';
import type { BookRow } from '@/types/database';

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    language?: string;
    averageRating?: number;
    ratingsCount?: number;
  };
}

export async function searchGoogleBooks(query: string, maxResults = 10): Promise<GoogleBooksVolume[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('printType', 'books');
  if (apiKey) url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

export function googleVolumeToBookData(volume: GoogleBooksVolume) {
  const info = volume.volumeInfo;
  const isbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;
  const isbn10 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier;

  return {
    google_books_id: volume.id,
    title: info.title,
    subtitle: info.subtitle ?? null,
    author_name: info.authors?.[0] ?? 'Unknown',
    author_names: info.authors ?? [],
    publisher: info.publisher ?? null,
    published_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : null,
    description: info.description ?? null,
    cover_url: info.imageLinks?.thumbnail?.replace('http:', 'https:') ?? null,
    page_count: info.pageCount ?? null,
    genres: info.categories ?? [],
    language: info.language ?? 'en',
    isbn_13: isbn13 ?? null,
    isbn_10: isbn10 ?? null,
    average_rating: info.averageRating ?? null,
    ratings_count: info.ratingsCount ?? 0,
  };
}

export async function getOrCreateBook(googleBooksId: string): Promise<BookRow | null> {
  const supabase = createServiceClient();
  const redis = getRedisClient();

  // Check DB first
  const { data: existing } = await supabase
    .from('books')
    .select('*')
    .eq('google_books_id', googleBooksId)
    .single();

  if (existing) {
    await redis.set(REDIS_KEYS.book(existing.id), JSON.stringify(existing), { ex: REDIS_TTL.BOOK });
    return existing;
  }

  // Fetch from Google Books and cache
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes/${googleBooksId}${apiKey ? `?key=${apiKey}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const volume: GoogleBooksVolume = await res.json();
  const bookData = googleVolumeToBookData(volume);

  const { data: inserted } = await supabase
    .from('books')
    .upsert(bookData, { onConflict: 'google_books_id' })
    .select()
    .single();

  if (inserted) {
    await redis.set(REDIS_KEYS.book(inserted.id), JSON.stringify(inserted), { ex: REDIS_TTL.BOOK });
  }
  return inserted ?? null;
}

export async function getBookById(id: string): Promise<BookRow | null> {
  const redis = getRedisClient();
  const cacheKey = REDIS_KEYS.book(id);

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as BookRow;

  const supabase = createServiceClient();
  const { data } = await supabase.from('books').select('*').eq('id', id).single();
  if (data) {
    await redis.set(cacheKey, JSON.stringify(data), { ex: REDIS_TTL.BOOK });
  }
  return data ?? null;
}

const LOCALE_TO_COUNTRY: Record<string, string> = {
  fr: 'FR',
  de: 'DE',
  en: 'US',
};

export async function buildAffiliateLinks(book: BookRow, country: string = 'US', locale?: string) {
  // If a locale is provided, use it to derive the country (locale takes precedence)
  if (locale && LOCALE_TO_COUNTRY[locale]) {
    country = LOCALE_TO_COUNTRY[locale];
  }
  const supabase = createServiceClient();
  const redis = getRedisClient();
  const cacheKey = REDIS_KEYS.affiliateLink(book.id, country);

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { data: stores } = await supabase
    .from('affiliate_stores')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  const links: { name: string; url: string; isAffiliate: boolean; isPrimary: boolean }[] = [];

  for (const store of stores ?? []) {
    const countriesMatch =
      store.countries.length === 0 || store.countries.includes(country);

    if (!countriesMatch) continue;

    const isbn = book.isbn_13 ?? book.isbn_10 ?? '';
    const url = store.url_template
      .replace('{isbn}', isbn)
      .replace('{tag}', store.affiliate_tag ?? '')
      .replace('{title}', encodeURIComponent(book.title));

    links.push({
      name: store.name,
      url,
      isAffiliate: !store.is_non_affiliate,
      isPrimary: store.priority === 1,
    });
  }

  if (links.length === 0) {
    links.push({
      name: 'WorldCat',
      url: `https://www.worldcat.org/search?q=${encodeURIComponent(book.isbn_13 ?? book.title)}`,
      isAffiliate: false,
      isPrimary: false,
    });
  }

  await redis.set(cacheKey, JSON.stringify(links), { ex: REDIS_TTL.AFFILIATE_LINK });
  return links;
}
