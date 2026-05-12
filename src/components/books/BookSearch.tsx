'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';

interface BookResult {
  id?: string;
  google_books_id?: string;
  title: string;
  author_name: string;
  cover_url?: string;
  published_year?: number;
  _external?: boolean;
}

export function BookSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.books ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={handleChange}
          placeholder="Search books, authors, ISBNs..."
          className="w-full pl-10 pr-4 py-3 border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
        />
      </div>

      {loading && (
        <div className="text-center py-8 text-muted-foreground text-sm">Searching...</div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          {results.map((book, i) => {
            const href = book.id
              ? `/book/${book.id}`
              : `/book/lookup?gid=${book.google_books_id}`;

            return (
              <Link
                key={book.id ?? book.google_books_id ?? i}
                href={href}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-14 relative">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      className="object-cover rounded"
                      sizes="40px"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted rounded flex items-center justify-center">
                      <span className="text-[8px] text-muted-foreground text-center px-1">{book.title.slice(0, 10)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{book.author_name}</p>
                  {book.published_year && (
                    <p className="text-xs text-muted-foreground">{book.published_year}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && query.length >= 2 && results.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">No books found for &quot;{query}&quot;</div>
      )}
    </div>
  );
}
