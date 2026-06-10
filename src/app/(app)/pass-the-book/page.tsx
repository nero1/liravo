'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface UserProfile {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface ChainNode {
  id: string;
  user_id: string;
  nominee_id: string | null;
  note: string | null;
  position: number;
  created_at: string;
  reader: UserProfile | null;
  nominee: UserProfile | null;
}

interface Chain {
  id: string;
  created_at: string;
  books: { id: string; title: string; author_name: string; cover_url: string | null } | null;
  nodes: ChainNode[];
}

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

function Avatar({ user, size = 32 }: { user: UserProfile | null; size?: number }) {
  if (!user) return <div style={{ width: size, height: size }} className="rounded-full bg-muted flex-shrink-0" />;
  if (user.avatar_url) {
    return (
      <Image
        src={user.avatar_url}
        alt={user.display_name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center flex-shrink-0"
    >
      {user.display_name[0].toUpperCase()}
    </div>
  );
}

function ChainViz({ nodes, currentUserId }: { nodes: ChainNode[]; currentUserId: string }) {
  const sorted = [...nodes].sort((a, b) => a.position - b.position);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {sorted.map((node, i) => (
        <div key={node.id} className="flex items-center gap-1">
          <Link href={`/user/${node.reader?.username ?? ''}`} className="flex flex-col items-center gap-1 group">
            <Avatar user={node.reader} size={36} />
            <span className={`text-[10px] max-w-[56px] truncate text-center ${node.user_id === currentUserId ? 'text-accent font-semibold' : 'text-muted-foreground'}`}>
              {node.user_id === currentUserId ? 'You' : node.reader?.display_name ?? '?'}
            </span>
          </Link>
          {i < sorted.length - 1 && (
            <span className="text-muted-foreground text-sm px-0.5">→</span>
          )}
        </div>
      ))}
      {sorted.length > 0 && sorted[sorted.length - 1].nominee_id && (
        <span className="text-muted-foreground text-sm px-0.5">→ ?</span>
      )}
    </div>
  );
}

export default function PassTheBookPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [passes, setPasses] = useState<PassData>({ received: [], sent: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'chains' | 'passes'>('chains');
  const [currentUserId, setCurrentUserId] = useState('');

  // Start chain form
  const [startOpen, setStartOpen] = useState(false);
  const [bookId, setBookId] = useState('');
  const [startNote, setStartNote] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  // Nominate form
  const [nominateChainId, setNominateChainId] = useState<string | null>(null);
  const [nomineeId, setNomineeId] = useState('');
  const [nomineeNote, setNomineeNote] = useState('');
  const [nominating, setNominating] = useState(false);
  const [nominateError, setNominateError] = useState('');

  // Simple pass form
  const [passBookId, setPassBookId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [passMessage, setPassMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/pass-the-book/chains').then((r) => r.json()),
      fetch('/api/pass-the-book').then((r) => r.json()),
    ]).then(([cData, pData]) => {
      setChains((cData as { chains?: Chain[] }).chains ?? []);
      setPasses(pData as PassData);
    }).catch(() => null).finally(() => setLoading(false));

    // Get current user id from the me endpoint
    fetch('/api/users/me').then((r) => r.json()).then((d: { user?: { id?: string } }) => {
      setCurrentUserId(d.user?.id ?? '');
    }).catch(() => null);
  }, []);

  async function handleStartChain(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId.trim()) return;
    setStarting(true);
    setStartError('');
    const res = await fetch('/api/pass-the-book/chains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId.trim(), note: startNote || undefined }),
    });
    const data = await res.json() as { chain?: Chain; error?: string };
    if (!res.ok) {
      setStartError(data.error ?? 'Failed to start chain');
    } else {
      setStartOpen(false);
      setBookId('');
      setStartNote('');
      // Reload chains
      const freshData = await fetch('/api/pass-the-book/chains').then((r) => r.json()) as { chains?: Chain[] };
      setChains(freshData.chains ?? []);
    }
    setStarting(false);
  }

  async function handleNominate(e: React.FormEvent) {
    e.preventDefault();
    if (!nomineeId.trim() || !nominateChainId) return;
    setNominating(true);
    setNominateError('');
    const res = await fetch(`/api/pass-the-book/chains/${nominateChainId}/nominate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nominee_id: nomineeId.trim(), note: nomineeNote || undefined }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    if (!res.ok) {
      setNominateError(data.error ?? 'Failed to nominate');
    } else {
      setNominateChainId(null);
      setNomineeId('');
      setNomineeNote('');
      const freshData = await fetch('/api/pass-the-book/chains').then((r) => r.json()) as { chains?: Chain[] };
      setChains(freshData.chains ?? []);
    }
    setNominating(false);
  }

  async function handleSimplePass(e: React.FormEvent) {
    e.preventDefault();
    if (!passBookId || !recipientId) return;
    setSending(true);
    setPassError('');
    setPassSuccess('');
    const res = await fetch('/api/pass-the-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: passBookId, recipient_id: recipientId, message: passMessage || undefined }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setPassError(data.error ?? 'Failed to pass book'); }
    else { setPassSuccess('Book passed!'); setPassBookId(''); setRecipientId(''); setPassMessage(''); }
    setSending(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Pass the Book</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Pass books along a chain of readers.</p>
        </div>
        {tab === 'chains' && (
          <button
            onClick={() => setStartOpen(!startOpen)}
            className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
          >
            + Start Chain
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['chains', 'passes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'chains' ? 'Chains' : 'Direct Passes'}
          </button>
        ))}
      </div>

      {/* Start chain form */}
      {tab === 'chains' && startOpen && (
        <form onSubmit={handleStartChain} className="rounded-xl border border-dashed border-border p-4 space-y-3">
          <p className="font-semibold text-sm">Start a New Chain</p>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Book ID (UUID)</label>
            <input
              type="text"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              placeholder="Paste the book UUID from the book page…"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Why start this chain? (optional)</label>
            <textarea
              value={startNote}
              onChange={(e) => setStartNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="This book changed my life…"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          {startError && <p className="text-xs text-red-500">{startError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStartOpen(false)} className="flex-1 rounded-lg border py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={starting || !bookId.trim()} className="flex-1 rounded-lg bg-accent text-white py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
              {starting ? 'Starting…' : 'Start Chain'}
            </button>
          </div>
        </form>
      )}

      {/* Nominate form */}
      {nominateChainId && (
        <form onSubmit={handleNominate} className="rounded-xl border border-accent/40 bg-accent/5 p-4 space-y-3">
          <p className="font-semibold text-sm">Pass to the next reader</p>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Nominee User ID (UUID)</label>
            <input
              type="text"
              value={nomineeId}
              onChange={(e) => setNomineeId(e.target.value)}
              placeholder="User UUID…"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Note (optional)</label>
            <textarea
              value={nomineeNote}
              onChange={(e) => setNomineeNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Why you're passing to them…"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          {nominateError && <p className="text-xs text-red-500">{nominateError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setNominateChainId(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={nominating || !nomineeId.trim()} className="flex-1 rounded-lg bg-accent text-white py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
              {nominating ? 'Passing…' : 'Pass the Book'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {tab === 'chains' && (
            <div className="space-y-4">
              {chains.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg">No chains yet</p>
                  <p className="text-sm mt-1">Start one by picking a book you loved!</p>
                </div>
              ) : (
                chains.map((chain) => {
                  const myNode = chain.nodes.find((n) => n.user_id === currentUserId);
                  const canPass = myNode && !myNode.nominee_id;
                  const sortedNodes = [...chain.nodes].sort((a, b) => a.position - b.position);

                  return (
                    <div key={chain.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        {chain.books?.cover_url && (
                          <Image
                            src={chain.books.cover_url}
                            alt={chain.books.title}
                            width={48}
                            height={72}
                            className="object-cover rounded-md flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <Link href={`/book/${chain.books?.id ?? ''}`} className="font-semibold text-foreground hover:text-accent line-clamp-1">
                            {chain.books?.title ?? 'Unknown Book'}
                          </Link>
                          <p className="text-xs text-muted-foreground">{chain.books?.author_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {sortedNodes.length} reader{sortedNodes.length !== 1 ? 's' : ''} in this chain
                          </p>
                        </div>
                        {canPass && (
                          <button
                            onClick={() => setNominateChainId(chain.id)}
                            className="rounded-lg bg-accent text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity flex-shrink-0"
                          >
                            Pass →
                          </button>
                        )}
                      </div>

                      {/* Chain visualization */}
                      <ChainViz nodes={chain.nodes} currentUserId={currentUserId} />

                      {/* Notes from nodes */}
                      {sortedNodes.some((n) => n.note) && (
                        <div className="space-y-1.5 border-t border-border pt-2">
                          {sortedNodes.filter((n) => n.note).map((n) => (
                            <div key={n.id} className="flex items-start gap-2">
                              <Avatar user={n.reader} size={20} />
                              <p className="text-xs text-muted-foreground italic flex-1">&ldquo;{n.note}&rdquo;</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'passes' && (
            <div className="space-y-6">
              {/* Direct pass form */}
              <section className="rounded-xl border border-border p-4 space-y-3">
                <h2 className="font-semibold text-sm">Send a Direct Pass</h2>
                <form onSubmit={handleSimplePass} className="space-y-3">
                  <input
                    type="text"
                    value={passBookId}
                    onChange={(e) => setPassBookId(e.target.value)}
                    placeholder="Book ID (UUID)"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <input
                    type="text"
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    placeholder="Recipient User ID (UUID)"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <textarea
                    value={passMessage}
                    onChange={(e) => setPassMessage(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Personal message (optional)"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  {passError && <p className="text-xs text-red-500">{passError}</p>}
                  {passSuccess && <p className="text-xs text-green-600">{passSuccess}</p>}
                  <button
                    type="submit"
                    disabled={sending || !passBookId || !recipientId}
                    className="w-full rounded-lg bg-accent text-white py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {sending ? 'Passing…' : 'Pass the Book'}
                  </button>
                </form>
              </section>

              {/* Received passes */}
              <section>
                <h2 className="font-semibold mb-3">Received ({passes.received.length})</h2>
                {passes.received.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No books passed to you yet.</p>
                ) : (
                  <div className="space-y-2">
                    {passes.received.map((p) => (
                      <div key={p.id} className="p-3 rounded-lg border border-border">
                        <Link href={`/book/${p.book_id}`} className="font-medium text-accent hover:underline text-sm">View Book</Link>
                        {p.message && <p className="text-sm text-muted-foreground mt-1">&ldquo;{p.message}&rdquo;</p>}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Sent passes */}
              <section>
                <h2 className="font-semibold mb-3">Sent ({passes.sent.length})</h2>
                {passes.sent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You haven&apos;t passed any books yet.</p>
                ) : (
                  <div className="space-y-2">
                    {passes.sent.map((p) => (
                      <div key={p.id} className="p-3 rounded-lg border border-border">
                        <Link href={`/book/${p.book_id}`} className="font-medium text-accent hover:underline text-sm">View Book</Link>
                        {p.message && <p className="text-sm text-muted-foreground mt-1">&ldquo;{p.message}&rdquo;</p>}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
