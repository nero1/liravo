import { BookSearch } from '@/components/books/BookSearch';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Discover' };

export default function DiscoverPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Discover</h1>
      <BookSearch />
    </div>
  );
}
