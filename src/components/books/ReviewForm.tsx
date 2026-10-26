'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';

import { useState, useCallback } from 'react';
import { Star, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOOD_TAGS } from '@/constants/config';
import type { ClientToneResult } from '@/lib/client/tone-classifier';

interface ReviewFormProps {
  bookId: string;
  userId: string;
  onSubmit?: () => void;
}

const REVIEW_TYPES = [
  { value: 'one_line', label: 'One line', maxChars: 280 },
  { value: 'short', label: 'Short', maxChars: 280 },
  { value: 'long', label: 'Long', maxChars: 2000 },
] as const;

type ReviewType = 'one_line' | 'short' | 'long';

export function ReviewForm({ bookId, onSubmit }: ReviewFormProps) {
  const intent = useRequestIntent();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewType, setReviewType] = useState<ReviewType>('short');
  const [body, setBody] = useState('');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [spoilerWarning, setSpoilerWarning] = useState(false);
  const [readDate, setReadDate] = useState('');
  const [editionRead, setEditionRead] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toneResult, setToneResult] = useState<ClientToneResult | null>(null);
  const [toneChecking, setToneChecking] = useState(false);

  const checkTone = useCallback(async (text: string) => {
    if (text.trim().length < 30) { setToneResult(null); return; }
    setToneChecking(true);
    try {
      // Lazy import — loads model only on first use
      const { classifyReviewTone } = await import('@/lib/client/tone-classifier');
      const result = await classifyReviewTone(text);
      setToneResult(result);
    } catch {
      setToneResult(null);
    } finally {
      setToneChecking(false);
    }
  }, []);

  const maxChars = REVIEW_TYPES.find((t) => t.value === reviewType)?.maxChars ?? 280;

  function toggleMood(tag: string) {
    setSelectedMoods((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    if (!body.trim()) {
      setError('Please write a review.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...intent.headers({ rating, body, reviewType, selectedMoods, spoilerWarning, readDate, editionRead }) },
        body: JSON.stringify({
          star_rating: rating,
          body: body.trim(),
          review_type: reviewType,
          mood_tags: selectedMoods,
          spoiler_warning: spoilerWarning,
          read_date: readDate || undefined,
          edition_read: editionRead || undefined,
        }),
      });
      if (res.ok) {
        intent.complete();
        setSuccess(true);
        onSubmit?.();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to submit review.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="p-4 border border-border rounded-xl text-center">
        <p className="text-amber-600 font-medium">Review submitted!</p>
        <p className="text-sm text-muted-foreground mt-1">Thank you for your review.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Star Rating */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Rating</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5"
            >
              <Star
                size={24}
                className={cn(
                  'transition-colors',
                  (hoverRating || rating) >= star
                    ? 'fill-amber-400 stroke-amber-400'
                    : 'stroke-muted-foreground'
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Review Type */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Review type</label>
        <div className="flex gap-2">
          {REVIEW_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                setReviewType(type.value);
                if (body.length > type.maxChars) setBody(body.slice(0, type.maxChars));
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                reviewType === type.value
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'border-border text-muted-foreground hover:border-amber-400'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Your review</label>
        <textarea
          value={body}
          onChange={(e) => {
            const val = e.target.value.slice(0, maxChars);
            setBody(val);
            // Debounce tone check on blur/change
          }}
          onBlur={(e) => { if (e.target.value.length >= 30) checkTone(e.target.value); }}
          rows={reviewType === 'long' ? 6 : 3}
          placeholder={
            reviewType === 'one_line'
              ? 'Sum it up in one line...'
              : reviewType === 'short'
              ? 'Write a short review...'
              : 'Write your full review...'
          }
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm bg-background resize-none',
            'focus:outline-none focus:ring-1 focus:ring-amber-500',
            toneResult === 'toxic' ? 'border-red-400' : toneResult === 'warning' ? 'border-amber-400' : 'border-border'
          )}
        />
        <div className="flex items-center justify-between mt-0.5">
          <div>
            {toneChecking && (
              <span className="text-xs text-muted-foreground">Checking tone…</span>
            )}
            {!toneChecking && toneResult === 'warning' && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle size={12} /> Tone may be harsh — please review
              </span>
            )}
            {!toneChecking && toneResult === 'toxic' && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={12} /> Potentially harmful language detected — reviews may be removed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {body.length}/{maxChars}
          </p>
        </div>
      </div>

      {/* Mood Tags */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Mood tags</label>
        <div className="flex flex-wrap gap-2">
          {MOOD_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleMood(tag)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                selectedMoods.includes(tag)
                  ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'border-border text-muted-foreground hover:border-amber-400'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Optional metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">Date read (optional)</label>
          <input
            type="date"
            value={readDate}
            onChange={(e) => setReadDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">Edition (optional)</label>
          <input
            type="text"
            value={editionRead}
            onChange={(e) => setEditionRead(e.target.value)}
            maxLength={100}
            placeholder="e.g. Kindle 2023"
            className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Spoiler Warning */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={spoilerWarning}
          onChange={(e) => setSpoilerWarning(e.target.checked)}
          className="w-4 h-4 accent-amber-500"
        />
        <span className="text-sm">Contains spoilers</span>
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-amber-500 text-white rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Submitting...' : 'Submit review'}
      </button>
    </form>
  );
}
