'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuoteFormProps {
  bookId: string;
  onSuccess?: () => void;
}

export function QuoteForm({ bookId, onSuccess }: QuoteFormProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book_id: bookId,
        content: content.trim(),
        page_number: pageNumber ? parseInt(pageNumber, 10) : undefined,
      }),
    });

    setSaving(false);
    setDone(true);
    setContent('');
    setPageNumber('');
    setOpen(false);
    onSuccess?.();
    setTimeout(() => setDone(false), 3000);
  };

  return (
    <div>
      {done && (
        <p className="text-sm text-accent mb-2">Quote saved!</p>
      )}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <Quote size={16} />
          Save a quote
        </button>
      ) : (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter the quote..."
            maxLength={1000}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={pageNumber}
              onChange={(e) => setPageNumber(e.target.value)}
              placeholder="Page # (optional)"
              min={1}
              className="w-32 px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className={cn(
                  'px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg font-medium transition-colors',
                  'hover:bg-accent/90 disabled:opacity-60'
                )}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
