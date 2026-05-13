'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewEventPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    is_paid: false,
    price: '',
    book_id: '',
    max_attendees: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      event_date: new Date(form.event_date).toISOString(),
      is_paid: form.is_paid,
      currency: 'USD',
    };
    if (form.is_paid && form.price) payload.price = parseFloat(form.price);
    if (form.book_id) payload.book_id = form.book_id;
    if (form.max_attendees) payload.max_attendees = parseInt(form.max_attendees);

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/events/${data.event.id}`);
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setPending(false);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">Create Event</h1>
      <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-6">
        Host a book event for the Liravo community.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Event title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            required
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={5000}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Describe your event..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date and Time</label>
          <input
            type="datetime-local"
            required
            value={form.event_date}
            onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="is_paid"
            checked={form.is_paid}
            onChange={(e) => setForm({ ...form, is_paid: e.target.checked })}
            className="rounded border-neutral-300 dark:border-neutral-700 text-accent focus:ring-accent"
          />
          <label htmlFor="is_paid" className="text-sm font-medium">
            Paid event
          </label>
        </div>

        {form.is_paid && (
          <div>
            <label className="block text-sm font-medium mb-1">Price (USD)</label>
            <input
              type="number"
              required={form.is_paid}
              min={0.5}
              step={0.01}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="9.99"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Book ID (optional)</label>
          <input
            type="text"
            value={form.book_id}
            onChange={(e) => setForm({ ...form, book_id: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="UUID of the related book"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Attendees (optional)</label>
          <input
            type="number"
            min={1}
            value={form.max_attendees}
            onChange={(e) => setForm({ ...form, max_attendees: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Leave empty for unlimited"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Creating...' : 'Create Event'}
        </button>
      </form>
    </div>
  );
}
