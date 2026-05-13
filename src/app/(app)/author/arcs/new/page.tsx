'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewArcPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    book_id: '',
    description: '',
    reader_slots: 5,
    close_date: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const payload: Record<string, unknown> = {
      book_id: form.book_id,
      description: form.description,
      reader_slots: form.reader_slots,
    };
    if (form.close_date) payload.close_date = new Date(form.close_date).toISOString();

    const res = await fetch('/api/author/arcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.push('/author/arcs');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setPending(false);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">Create New ARC</h1>
      <p className="text-neutral-600 dark:text-neutral-400 mb-6 text-sm">
        Offer Advance Reader Copies to your early readers. Maximum 20 reader slots per ARC.
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
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            required
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={1000}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Describe what you're looking for in ARC readers, any requirements, etc."
          />
          <p className="text-xs text-neutral-500 mt-1">{form.description.length}/1000</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Reader Slots (1–20)
          </label>
          <input
            type="number"
            required
            min={1}
            max={20}
            value={form.reader_slots}
            onChange={(e) => setForm({ ...form, reader_slots: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Close Date (optional)</label>
          <input
            type="date"
            value={form.close_date}
            onChange={(e) => setForm({ ...form, close_date: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Creating...' : 'Create ARC'}
        </button>
      </form>
    </div>
  );
}
