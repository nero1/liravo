'use client';

import { useState, useEffect } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Note {
  id: string;
  note: string;
  created_at: string;
}

interface CommunityNoteProps {
  contentType: string;
  contentId: string;
}

export function CommunityNote({ contentType, contentId }: CommunityNoteProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  if (!expanded && !loaded) {
    // Peek: small info icon that triggers load on click
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
        <span>Community notes</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all',
          expanded ? 'mt-2' : 'h-0'
        )}
      >
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No community notes yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium">
              Added by community reviewers
            </p>
            {notes.map((note) => (
              <div
                key={note.id}
                className="text-xs bg-muted/50 border border-border rounded-md px-3 py-2"
              >
                {note.note}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
