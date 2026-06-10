'use client';

import { useState, useEffect } from 'react';
import { Info, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Note {
  id: string;
  note: string;
  created_at: string;
}

interface CommunityNoteProps {
  contentType: 'review' | 'quote' | 'profile' | 'debate';
  contentId: string;
  canContribute?: boolean;
}

export function CommunityNote({ contentType, contentId, canContribute = false }: CommunityNoteProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    fetch(`/api/moderation/community-notes?contentType=${contentType}&contentId=${contentId}`)
      .then((r) => r.json())
      .then((json: { notes?: Note[] }) => setNotes(json.notes ?? []))
      .catch(() => {});
  }, [loaded, contentType, contentId]);

  function handleToggle() {
    if (!loaded) setLoaded(true);
    setExpanded((prev) => !prev);
  }

  async function handleSubmitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetch('/api/moderation/community-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType, content_id: contentId, note: noteText }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      setSubmitError(data.error ?? 'Failed to submit');
    } else {
      setSubmitted(true);
      setAdding(false);
      setNoteText('');
    }
    setSubmitting(false);
  }

  if (!expanded && !loaded) {
    return (
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
        aria-label="Show community notes"
      >
        <Info size={14} />
        <span>Community notes</span>
        <ChevronDown size={12} />
      </button>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info size={14} />
        <span>Community notes{notes.length > 0 ? ` (${notes.length})` : ''}</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <div className={cn('overflow-hidden transition-all', expanded ? 'mt-2' : 'h-0')}>
        {notes.length === 0 && !submitted ? (
          <p className="text-xs text-muted-foreground italic">No community notes yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.length > 0 && (
              <p className="text-xs text-muted-foreground font-medium">Added by community reviewers</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className="text-xs bg-muted/50 border border-border rounded-md px-3 py-2">
                {note.note}
              </div>
            ))}
            {submitted && (
              <p className="text-xs text-green-600 font-medium">Your note has been submitted for review.</p>
            )}
          </div>
        )}

        {canContribute && !submitted && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
          >
            <Plus size={12} />
            Add a note
          </button>
        )}

        {adding && (
          <form onSubmit={handleSubmitNote} className="mt-2 flex flex-col gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              minLength={10}
              maxLength={500}
              rows={3}
              placeholder="Add context or a correction (10–500 chars)…"
              className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {submitError && <p className="text-xs text-red-500">{submitError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || noteText.trim().length < 10}
                className="text-xs bg-accent text-white px-3 py-1 rounded-md disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setNoteText(''); setSubmitError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
