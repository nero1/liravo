import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {languageAlternates} from '@/lib/metadata';
import {z}from'zod';
import type { BookRow } from '@/types/database';
import {AffiliateLinkButtons} from '@/components/books/AffiliateLinkButtons';
import type {AffiliateLink} from '@/services/books';
import { buildAffiliateLinks } from '@/services/books';

export const dynamic = 'force-dynamic';

export async function generateMetadata(){const t=await getTranslations('writingResources');return {title:t('metadataTitle'),description:t('description'),alternates:languageAlternates('/write/resources')};}

const WRITING_BOOKS = [
  {
    isbn: '9781439193600',
    title: 'On Writing',
    author: 'Stephen King',
    section: 'craft',
  },
  {
    isbn: '9780060391683',
    title: 'Story',
    author: 'Robert McKee',
    section: 'craft',
  },
  {
    isbn: '9780385480017',
    title: 'Bird by Bird',
    author: 'Anne Lamott',
    section: 'craft',
  },
  {
    isbn: '9780020130208',
    title: 'The Elements of Style',
    author: 'William Strunk Jr. & E.B. White',
    section: 'grammar',
  },
  {
    isbn: '9781932907001',
    title: 'Save the Cat',
    author: 'Blake Snyder',
    section: 'screenwriting',
  },
  {
    isbn: '9780877733645',
    title: 'Writing Down the Bones',
    author: 'Natalie Goldberg',
    section: 'craft',
  },
  {
    isbn: '9780874776942',
    title: "The Artist's Way",
    author: 'Julia Cameron',
    section: 'development',
  },
  {
    isbn: '9781592401277',
    title: 'Eats, Shoots & Leaves',
    author: 'Lynne Truss',
    section: 'grammar',
  },
  {
    isbn: '9781936891023',
    title: 'The War of Art',
    author: 'Steven Pressfield',
    section: 'development',
  },
  {
    isbn: '9781594634727',
    title: 'Big Magic',
    author: 'Elizabeth Gilbert',
    section: 'development',
  },
];

const SECTION_ORDER = [
  'craft',
  'development',
  'grammar',
  'screenwriting',
];

interface BookWithLinks {
  isbn: string;
  title: string;
  author: string;
  section: string;
  dbBook: BookRow | null;
  affiliateLinks:AffiliateLink[];
}

export default async function ResourceLibraryPage() {
  const supabase = (await createClient());
  const t=await getTranslations('writingResources'),writing=await getTranslations('writing');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const {data:profile,error:profileError}=await supabase.from('users').select('country,preferred_locale').eq('id',user.id).single();
  if(profileError||!profile)throw new Error('Profile unavailable');

  // Look up books in DB by ISBN
  const isbns = WRITING_BOOKS.map((b) => b.isbn);
  const { data: dbBooks,error:booksError } = await supabase
    .from('books')
    .select('*')
    .in('isbn_13', isbns);
  if(booksError)throw new Error('Resource books unavailable');

  const dbBookByIsbn = new Map<string, BookRow>(
    (dbBooks ?? []).map((b) => [b.isbn_13 ?? '', {...b,average_rating:b.average_rating===null?null:Number(b.average_rating),metadata_provenance:z.record(z.string(),z.string()).parse(b.metadata_provenance)}])
  );

  // Build book data with affiliate links
  const booksWithLinks: BookWithLinks[] = await Promise.all(
    WRITING_BOOKS.map(async (wb) => {
      const dbBook = dbBookByIsbn.get(wb.isbn) ?? null;
      let affiliateLinks: BookWithLinks['affiliateLinks'] = [];
      if (dbBook) {
        try {
          affiliateLinks = await buildAffiliateLinks(dbBook,profile.country??'US',profile.preferred_locale);
        } catch {
          affiliateLinks = [];
        }
      }
      return { ...wb, dbBook, affiliateLinks };
    })
  );

  const sections = SECTION_ORDER.filter((sec) =>
    booksWithLinks.some((b) => b.section === sec)
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t('description')}
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          {writing('writeHub')}
        </Link>
      </div>

      {sections.map((section) => {
        const sectionBooks = booksWithLinks.filter((b) => b.section === section);
        return (
          <div key={section} className="mb-10">
            <h2 className="font-display text-lg font-semibold mb-4 border-b pb-2">{t(`sections.${section}`)}</h2>
            <div className="space-y-4">
              {sectionBooks.map((book) => {
                const primaryLink = book.affiliateLinks.find((l) => l.isPrimary);
                const anyLink = book.affiliateLinks[0];
                const buyLink = primaryLink ?? anyLink;

                return (
                  <div key={book.isbn} className="flex gap-4 rounded-xl border bg-card p-5">
                    {/* Cover */}
                    <div className="shrink-0 w-16 h-24 rounded-lg bg-muted overflow-hidden">
                      {book.dbBook?.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={book.dbBook.cover_url}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">
                          📚
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{book.title}</h3>
                      <p className="text-sm text-muted-foreground">{book.author}</p>
                      <p className="text-sm mt-1 leading-relaxed">{t(`books.${book.isbn}`)}</p>

                      <div className="flex items-center gap-3 mt-3">
                        {buyLink&&book.dbBook ? (
                          <AffiliateLinkButtons links={[buyLink]} bookId={book.dbBook.id} userId={user.id}/>
                        ) : (
                          <Link
                            href={`/discover?q=${encodeURIComponent(book.isbn)}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                          >
                            {t('search')}
                          </Link>
                        )}
                        {book.dbBook && (
                          <Link
                            href={`/book/${book.dbBook.id}`}
                            className="text-sm text-amber-600 hover:underline"
                          >
                            {t('view')}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground text-center mt-6">
        {t('disclosure')}
      </p>
    </div>
  );
}
