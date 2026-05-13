'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyAuthorClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    pen_name: '',
    publisher: '',
    book_titles: '',
    website_url: '',
    social_proof_url: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch('/api/author/verification-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setPending(false);
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-bold mb-4">Request Submitted</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Your author verification request has been submitted. We will review it and notify you
          within a few business days.
        </p>
        <button
          onClick={() => router.push('/settings')}
          className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
        >
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-2">Request Author Verification</h1>
      <p className="text-neutral-600 dark:text-neutral-400 mb-6">
        Fill in the details below to apply for a verified author badge on Liravo.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Pen Name</label>
          <input
            type="text"
            required
            value={form.pen_name}
            onChange={(e) => setForm({ ...form, pen_name: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Name as it appears on your books"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Publisher (optional)</label>
          <input
            type="text"
            value={form.publisher}
            onChange={(e) => setForm({ ...form, publisher: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Publisher name if traditionally published"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Book Titles</label>
          <textarea
            required
            rows={4}
            value={form.book_titles}
            onChange={(e) => setForm({ ...form, book_titles: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="List your published books, one per line"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Author Website URL (optional)</label>
          <input
            type="url"
            value={form.website_url}
            onChange={(e) => setForm({ ...form, website_url: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="https://yourauthorwebsite.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Social Proof URL (optional)</label>
          <input
            type="url"
            value={form.social_proof_url}
            onChange={(e) => setForm({ ...form, social_proof_url: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Goodreads, Amazon author page, etc."
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Submitting...' : 'Submit Verification Request'}
        </button>
      </form>
    </div>
  );
}
