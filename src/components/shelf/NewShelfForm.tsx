'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { slugify } from '@/lib/utils';

const FREE_SHELF_LIMIT = 10;

interface NewShelfFormProps {
  userId: string;
  customShelfCount: number;
}

export function NewShelfForm({ userId, customShelfCount }: NewShelfFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = customShelfCount >= FREE_SHELF_LIMIT;

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (atLimit) { setError(`Free accounts can have up to ${FREE_SHELF_LIMIT} custom shelves.`); return; }

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const slug = slugify(name) + '-' + Date.now().toString(36);

    const { error: err } = await supabase.from('shelves').insert({
      user_id: userId,
      name: name.trim(),
      slug,
      description: description.trim() || null,
      is_public: isPublic,
      is_default: false,
    });

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    router.push(`/shelf/${slug}`);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {atLimit && (
        <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
          You&apos;ve reached the {FREE_SHELF_LIMIT}-shelf limit for free accounts.
          Upgrade to Premium for unlimited shelves.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Shelf name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Favourites, To read in 2025..."
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
          disabled={atLimit}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          rows={2}
          className="w-full px-3 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm resize-none"
          disabled={atLimit}
        />
      </div>

      <div className="flex items-center justify-between p-3 border border-border rounded-lg">
        <div>
          <p className="font-medium text-sm">Public shelf</p>
          <p className="text-xs text-muted-foreground">Visible on your profile</p>
        </div>
        <button
          type="button"
          onClick={() => setIsPublic((v) => !v)}
          className={`relative w-10 h-6 rounded-full transition-colors ${isPublic ? 'bg-accent' : 'bg-muted'}`}
          disabled={atLimit}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-4' : ''}`}
          />
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || atLimit}
          className="flex-1 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors text-sm disabled:opacity-60"
        >
          {saving ? 'Creating...' : 'Create shelf'}
        </button>
      </div>
    </div>
  );
}
