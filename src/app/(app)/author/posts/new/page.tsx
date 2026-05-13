'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewAuthorPostPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    body: '',
    book_id: '',
    type: 'blog' as 'announcement' | 'blog' | 'arc_invite',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: form.title,
      body: form.body,
      type: form.type,
    };
    if (form.book_id) payload.book_id = form.book_id;

    const res = await fetch('/api/author/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.push('/profile');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setPending(false);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-6">Create Author Post</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Post Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="blog">Blog Post</option>
            <option value="announcement">Announcement</option>
            <option value="arc_invite">ARC Invite</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Post title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Content</label>
          <textarea
            required
            rows={8}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            maxLength={2000}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Write your post..."
          />
          <p className="text-xs text-neutral-500 mt-1">{form.body.length}/2000</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Linked Book ID (optional)</label>
          <input
            type="text"
            value={form.book_id}
            onChange={(e) => setForm({ ...form, book_id: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="UUID of the book (optional)"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Publishing...' : 'Publish Post'}
        </button>
      </form>
    </div>
  );
}
