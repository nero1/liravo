'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOOD_TAGS } from '@/constants/config';

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
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewType, setReviewType] = useState<ReviewType>('short');
  const [body, setBody] = useState('');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [spoilerWarning, setSpoilerWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          star_rating: rating,
          body: body.trim(),
          review_type: reviewType,
          mood_tags: selectedMoods,
          spoiler_warning: spoilerWarning,
        }),
      });
      if (res.ok) {
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
          onChange={(e) => setBody(e.target.value.slice(0, maxChars))}
          rows={reviewType === 'long' ? 6 : 3}
          placeholder={
            reviewType === 'one_line'
              ? 'Sum it up in one line...'
              : reviewType === 'short'
              ? 'Write a short review...'
              : 'Write your full review...'
          }
          className={cn(
            'w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-none',
            'focus:outline-none focus:ring-1 focus:ring-amber-500'
          )}
        />
        <p className="text-xs text-muted-foreground text-right mt-0.5">
          {body.length}/{maxChars}
        </p>
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
