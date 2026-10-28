import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { BookRow } from '@/types/database';
import {AffiliateLinkButtons} from '@/components/books/AffiliateLinkButtons';
import type {AffiliateLink} from '@/services/books';
import { buildAffiliateLinks } from '@/services/books';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Essential Books for Writers — Liravo Resource Library',
  description:
    'A curated selection of the best craft books for writers: storytelling, grammar, structure, memoir, and more.',
};

const WRITING_BOOKS = [
  {
    isbn: '9781439193600',
    title: 'On Writing',
    author: 'Stephen King',
    description: 'A master storyteller shares his craft and life in one indispensable volume.',
    section: 'Craft & Structure',
  },
  {
    isbn: '9780060391683',
    title: 'Story',
    author: 'Robert McKee',
    description: 'The definitive guide to story structure, used by screenwriters worldwide.',
    section: 'Craft & Structure',
  },
  {
    isbn: '9780385480017',
    title: 'Bird by Bird',
    author: 'Anne Lamott',
    description: "Anne Lamott's beloved guide to writing and life — warm, funny, and essential.",
    section: 'Craft & Structure',
  },
  {
    isbn: '9780020130208',
    title: 'The Elements of Style',
    author: 'William Strunk Jr. & E.B. White',
    description: 'The timeless handbook of English style and composition.',
    section: 'Grammar & Style',
  },
  {
    isbn: '9781932907001',
    title: 'Save the Cat',
    author: 'Blake Snyder',
    description: 'The last book on screenwriting you will ever need — packed with structure secrets.',
    section: 'Screenwriting',
  },
  {
    isbn: '9780877733645',
    title: 'Writing Down the Bones',
    author: 'Natalie Goldberg',
    description: 'Freeing the writer within through Zen practice and daily writing exercises.',
    section: 'Craft & Structure',
  },
  {
    isbn: '9780874776942',
    title: "The Artist's Way",
    author: 'Julia Cameron',
    description: 'A spiritual path to higher creativity through morning pages and artist dates.',
    section: 'Story Development',
  },
  {
    isbn: '9781592401277',
    title: 'Eats, Shoots & Leaves',
    author: 'Lynne Truss',
    description: 'A zero-tolerance approach to punctuation, told with wit and passion.',
    section: 'Grammar & Style',
  },
  {
    isbn: '9781936891023',
    title: 'The War of Art',
    author: 'Steven Pressfield',
    description: 'Break through the blocks and win your inner creative battles.',
    section: 'Story Development',
  },
  {
    isbn: '9781594634727',
    title: 'Big Magic',
    author: 'Elizabeth Gilbert',
    description: 'Creative living beyond fear — a manifesto for living a curiosity-driven life.',
    section: 'Story Development',
  },
];

const SECTION_ORDER = [
  'Craft & Structure',
  'Story Development',
  'Grammar & Style',
  'Screenwriting',
  'Memoir & Non-fiction',
];

interface BookWithLinks {
  isbn: string;
  title: string;
  author: string;
  description: string;
  section: string;
  dbBook: BookRow | null;
  affiliateLinks:AffiliateLink[];
}

export default async function ResourceLibraryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const {data:profile,error:profileError}=await supabase.from('users').select('country,preferred_locale').eq('id',user.id).single();
  if(profileError||!profile)throw new Error('Profile unavailable');

  // Look up books in DB by ISBN
  const isbns = WRITING_BOOKS.map((b) => b.isbn);
  const { data: dbBooks } = await supabase
    .from('books')
    .select('*')
    .in('isbn_13', isbns);

  const dbBookByIsbn = new Map<string, BookRow>(
    (dbBooks ?? []).map((b) => [b.isbn_13 ?? '', b])
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
          <h1 className="font-display text-2xl font-bold">Essential Books for Writers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Curated craft books to level up your writing at every stage.
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          ← Write Hub
        </Link>
      </div>

      {sections.map((section) => {
        const sectionBooks = booksWithLinks.filter((b) => b.section === section);
        return (
          <div key={section} className="mb-10">
            <h2 className="font-display text-lg font-semibold mb-4 border-b pb-2">{section}</h2>
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
                      <p className="text-sm mt-1 leading-relaxed">{book.description}</p>

                      <div className="flex items-center gap-3 mt-3">
                        {buyLink&&book.dbBook ? (
                          <AffiliateLinkButtons links={[buyLink]} bookId={book.dbBook.id} userId={user.id}/>
                        ) : (
                          <Link
                            href={`/discover?q=${encodeURIComponent(book.title)}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                          >
                            Search on Liravo
                          </Link>
                        )}
                        {book.dbBook && (
                          <Link
                            href={`/books/${book.dbBook.id}`}
                            className="text-sm text-amber-600 hover:underline"
                          >
                            View on Liravo →
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
        Some links may be affiliate links. Liravo earns a small commission at no extra cost to you.
      </p>
    </div>
  );
}
