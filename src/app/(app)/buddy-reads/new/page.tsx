'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewBuddyReadPage() {
  const intent = useRequestIntent();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    book_id: '',
    max_participants: 3,
    current_chapter: 1,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/buddy-reads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...intent.headers(form) },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const data = await res.json();
        intent.complete();
        router.push(`/buddy-reads/${data.buddyRead.id}`);
      } else {
        const data = await res.json();
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong');
      }
    } catch { setError('Network error. Please retry.'); } finally { setPending(false); }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">Start a Buddy Read</h1>
      <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-6">
        Read a book together with 2–5 friends.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Book ID</label>
          <input
            type="text"
            required
            value={form.book_id}
            onChange={(e) => setForm({ ...form, book_id: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="UUID of the book"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Participants (2–5)</label>
          <input
            type="number"
            required
            min={2}
            max={5}
            value={form.max_participants}
            onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Starting Chapter</label>
          <input
            type="number"
            required
            min={1}
            value={form.current_chapter}
            onChange={(e) => setForm({ ...form, current_chapter: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Creating...' : 'Start Buddy Read'}
        </button>
      </form>
    </div>
  );
}
