'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewListPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, is_public: isPublic }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Failed to create list');
        return;
      }

      const d = await res.json() as { list?: { id: string } };
      if (d.list?.id) {
        router.push(`/lists/${d.list.id}`);
      } else {
        router.push('/lists');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/lists" className="text-sm text-neutral-500 hover:underline mb-4 inline-block">
        ← Back to Lists
      </Link>
      <h1 className="font-display text-2xl font-bold mb-6">Create Reading List</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            List Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g. Summer Reads 2026"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            placeholder="What is this list about?"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
          </label>
          <span className="text-sm font-medium">{isPublic ? 'Public' : 'Private'}</span>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create List'}
        </button>
      </form>
    </div>
  );
}
