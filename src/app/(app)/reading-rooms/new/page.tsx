'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewReadingRoomPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    book_id: '',
    is_public: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name,
      is_public: form.is_public,
    };
    if (form.book_id) payload.book_id = form.book_id;

    const res = await fetch('/api/reading-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/reading-rooms/${data.room.id}`);
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setPending(false);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">Create Reading Room</h1>
      <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-6">
        Create a shared space for readers to gather and discuss a book.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Room Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={100}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g. Dune Reading Circle"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Book ID (optional)</label>
          <input
            type="text"
            value={form.book_id}
            onChange={(e) => setForm({ ...form, book_id: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="UUID of the book"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="is_public"
            checked={form.is_public}
            onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
            className="rounded border-neutral-300 dark:border-neutral-700 text-accent focus:ring-accent"
          />
          <label htmlFor="is_public" className="text-sm font-medium">
            Public room (anyone can join)
          </label>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Creating...' : 'Create Room'}
        </button>
      </form>
    </div>
  );
}
