'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BookOpen, Check, ChevronDown } from 'lucide-react';
import type { ShelfRow } from '@/types/database';

interface AddToShelfButtonProps {
  bookId: string;
  userId: string;
}

const isDirectPostgresMode = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER ?? 'supabase') !== 'supabase';

export function AddToShelfButton({ bookId, userId }: AddToShelfButtonProps) {
  const [shelves, setShelves] = useState<ShelfRow[]>([]);
  const [addedToShelves, setAddedToShelves] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (isDirectPostgresMode) {
        const res = await fetch(`/api/shelves?bookId=${encodeURIComponent(bookId)}`);
        if (!res.ok) return;
        const { shelves: s, addedToShelves: a } = await res.json();
        setShelves(s ?? []);
        setAddedToShelves(new Set(a ?? []));
        return;
      }

      const supabase = createClient();
      const [{ data: shelvesData }, { data: existingEntries }] = await Promise.all([
        supabase.from('shelves').select('*').eq('user_id', userId).order('is_default', { ascending: false }),
        supabase.from('shelf_books').select('shelf_id').eq('book_id', bookId).eq('user_id', userId),
      ]);
      setShelves(shelvesData ?? []);
      setAddedToShelves(new Set((existingEntries ?? []).map((e) => e.shelf_id)));
    };
    load();
  }, [bookId, userId]);

  const handleToggleShelf = async (shelf: ShelfRow) => {
    setLoading(true);
    const isAdded = addedToShelves.has(shelf.id);

    if (isDirectPostgresMode) {
      const res = await fetch('/api/shelf-books/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shelfId: shelf.id,
          bookId,
          action: isAdded ? 'remove' : 'add',
        }),
      });

      if (res.ok) {
        if (isAdded) {
          setAddedToShelves((prev) => { const next = new Set(prev); next.delete(shelf.id); return next; });
        } else {
          setAddedToShelves((prev) => new Set(Array.from(prev).concat(shelf.id)));
          if (shelf.default_type === 'have_read') {
            await fetch('/api/xp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'finish_book' }),
            });
          }
        }
      }
      setLoading(false);
      return;
    }

    const supabase = createClient();

    if (isAdded) {
      await supabase.from('shelf_books').delete()
        .eq('shelf_id', shelf.id).eq('book_id', bookId).eq('user_id', userId);
      setAddedToShelves((prev) => { const next = new Set(prev); next.delete(shelf.id); return next; });
    } else {
      await supabase.from('shelf_books').upsert({
        shelf_id: shelf.id,
        book_id: bookId,
        user_id: userId,
      }, { onConflict: 'shelf_id,book_id' });
      setAddedToShelves((prev) => new Set(Array.from(prev).concat(shelf.id)));

      // Award XP via API for shelf additions
      if (shelf.default_type === 'have_read') {
        await fetch('/api/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finish_book' }),
        });
      }
    }
    setLoading(false);
  };

  const isInAnyShelve = addedToShelves.size > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
      >
        {isInAnyShelve ? <Check size={16} className="text-accent" /> : <BookOpen size={16} />}
        {isInAnyShelve ? 'On shelf' : 'Add to shelf'}
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[200px]">
            {shelves.map((shelf) => (
              <button
                key={shelf.id}
                onClick={() => handleToggleShelf(shelf)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted text-sm transition-colors"
              >
                <span>{shelf.name}</span>
                {addedToShelves.has(shelf.id) && <Check size={14} className="text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
