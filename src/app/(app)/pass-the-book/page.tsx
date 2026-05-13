'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface BookPass {
  id: string;
  sender_id?: string;
  recipient_id?: string;
  book_id: string;
  message: string | null;
  created_at: string;
}

interface PassData {
  received: BookPass[];
  sent: BookPass[];
}

export default function PassTheBookPage() {
  const [data, setData] = useState<PassData>({ received: [], sent: [] });
  const [loading, setLoading] = useState(true);
  const [bookId, setBookId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/pass-the-book')
      .then((r) => r.json())
      .then((d: PassData) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handlePass(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId || !recipientId) return;

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/pass-the-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId, recipient_id: recipientId, message: message || undefined }),
      });

      const d = await res.json() as { error?: string };
      if (!res.ok) {
        setError(d.error ?? 'Failed to pass book');
      } else {
        setSuccess('Book passed successfully!');
        setBookId('');
        setRecipientId('');
        setMessage('');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="font-display text-2xl font-bold">Pass the Book</h1>
      <p className="text-neutral-600 dark:text-neutral-400 text-sm">
        Nominate a book and pass it to someone you follow with a personal message.
      </p>

      {/* Pass Form */}
      <section className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-xl space-y-4">
        <h2 className="font-semibold">Pass a Book</h2>
        <form onSubmit={handlePass} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Book ID</label>
            <input
              type="text"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              placeholder="Book UUID (from book page)"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Recipient User ID</label>
            <input
              type="text"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              placeholder="Recipient UUID"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Why are you passing this book?"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}
          <button
            type="submit"
            disabled={sending || !bookId || !recipientId}
            className="w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {sending ? 'Passing...' : 'Pass the Book'}
          </button>
        </form>
      </section>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-neutral-100 dark:bg-neutral-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Received */}
          <section>
            <h2 className="font-semibold text-lg mb-3">Books Passed to You ({data.received.length})</h2>
            {data.received.length === 0 ? (
              <p className="text-neutral-500 text-sm">No books passed to you yet.</p>
            ) : (
              <div className="space-y-2">
                {data.received.map((p) => (
                  <div key={p.id} className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                    <Link href={`/book/${p.book_id}`} className="font-medium text-accent hover:underline text-sm">
                      View Book
                    </Link>
                    {p.message && <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">&ldquo;{p.message}&rdquo;</p>}
                    <p className="text-xs text-neutral-500 mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sent */}
          <section>
            <h2 className="font-semibold text-lg mb-3">Books You Passed ({data.sent.length})</h2>
            {data.sent.length === 0 ? (
              <p className="text-neutral-500 text-sm">You haven&apos;t passed any books yet.</p>
            ) : (
              <div className="space-y-2">
                {data.sent.map((p) => (
                  <div key={p.id} className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                    <Link href={`/book/${p.book_id}`} className="font-medium text-accent hover:underline text-sm">
                      View Book
                    </Link>
                    {p.message && <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">&ldquo;{p.message}&rdquo;</p>}
                    <p className="text-xs text-neutral-500 mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
