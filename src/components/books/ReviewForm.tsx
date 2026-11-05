'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';

import { useState,useCallback,useRef,useEffect } from 'react';
import {useTranslations} from 'next-intl';
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
  { value: 'one_line', maxChars: 280 },
  { value: 'short', maxChars: 280 },
  { value: 'long', maxChars: 2000 },
] as const;

type ReviewType = 'one_line' | 'short' | 'long';

export function ReviewForm(props:ReviewFormProps){return <OwnedReviewForm key={props.userId+':'+props.bookId} {...props}/>;}
function OwnedReviewForm({bookId,userId,onSubmit}:ReviewFormProps){
  const t=useTranslations('reviewForm'),common=useTranslations('common'),moods=useTranslations('moods'),intent=useRequestIntent(userId),busy=useRef(false),toneVersion=useRef(0);
  useEffect(()=>()=>{toneVersion.current++;},[]);
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
    const version=++toneVersion.current;
    if(text.trim().length<30){setToneResult(null);setToneChecking(false);return;}
    setToneChecking(true);
    try {
      // Lazy import — loads model only on first use
      const { classifyReviewTone } = await import('@/lib/client/tone-classifier');
      const result = await classifyReviewTone(text);
      if(version===toneVersion.current)setToneResult(result);
    } catch {
      if(version===toneVersion.current)setToneResult(null);
    } finally {
      if(version===toneVersion.current)setToneChecking(false);
    }
  }, []);

  const maxChars = REVIEW_TYPES.find((t) => t.value === reviewType)?.maxChars ?? 280;

  function toggleMood(tag: string) {
    setSelectedMoods((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();if(busy.current)return;
    if (rating === 0) {
      setError(t('selectRating'));
      return;
    }
    if (!body.trim()) {
      setError(t('writeReview'));
      return;
    }
    setError(null);
    busy.current=true;setLoading(true);
    const payload={star_rating:rating,body:body.trim(),review_type:reviewType,mood_tags:selectedMoods,spoiler_warning:spoilerWarning,read_date:readDate||undefined,edition_read:editionRead||undefined},scope='review:'+bookId;
    try {
      const res = await fetch(`/api/books/${bookId}/reviews`, {
        method: 'POST',
        headers:{'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload),
      });
      if (res.ok) {
        const result=await res.json();if(typeof result.review?.id!=='string'||result.review.user_id!==userId||result.review.book_id!==bookId)throw new Error('Invalid review receipt');intent.complete(scope);
        setSuccess(true);
        onSubmit?.();
      } else {
        setError(t('failed'));
      }
    } catch {
      setError(t('failed'));
    } finally {
      busy.current=false;setLoading(false);
    }
  }

  if (success) {
    return (
      <div role="status" className="p-4 border border-border rounded-xl text-center">
        <p className="text-amber-600 font-medium">{t('submitted')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('thanks')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Star Rating */}
      <fieldset disabled={loading}>
        <legend className="text-sm font-medium mb-1.5 block">{t('rating')}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)} disabled={loading} aria-label={t('ratingValue',{count:star})} aria-pressed={rating===star}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5"
            >
              <Star
                aria-hidden="true" size={24}
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
      </fieldset>

      {/* Review Type */}
      <fieldset disabled={loading}>
        <legend className="text-sm font-medium mb-1.5 block">{t('type')}</legend>
        <div className="flex gap-2">
          {REVIEW_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              disabled={loading} aria-pressed={reviewType===type.value}
              onClick={() => {
                toneVersion.current++;setToneResult(null);setToneChecking(false);setReviewType(type.value);
                if (body.length > type.maxChars) setBody(body.slice(0, type.maxChars));
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                reviewType === type.value
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'border-border text-muted-foreground hover:border-amber-400'
              )}
            >
              {t('types.'+type.value)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Body */}
      <div>
        <label htmlFor={'review-body-'+bookId} className="text-sm font-medium mb-1.5 block">{t('body')}</label>
        <textarea id={'review-body-'+bookId} disabled={loading}
          value={body}
          onChange={(e) => {
            const val = e.target.value.slice(0, maxChars);
            setBody(val);toneVersion.current++;setToneResult(null);setToneChecking(false);
          }}
          onBlur={(e) => { if (e.target.value.length >= 30) checkTone(e.target.value); }}
          rows={reviewType === 'long' ? 6 : 3}
          placeholder={t('placeholders.'+reviewType)}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm bg-background resize-none',
            'focus:outline-none focus:ring-1 focus:ring-amber-500',
            toneResult === 'toxic' ? 'border-red-400' : toneResult === 'warning' ? 'border-amber-400' : 'border-border'
          )}
        />
        <div className="flex items-center justify-between mt-0.5">
          <div role="status">
            {toneChecking && (
              <span className="text-xs text-muted-foreground">{t('checkingTone')}</span>
            )}
            {!toneChecking && toneResult === 'warning' && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle size={12} /> {t('harshTone')}
              </span>
            )}
            {!toneChecking && toneResult === 'toxic' && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={12} /> {t('harmfulTone')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {body.length}/{maxChars}
          </p>
        </div>
      </div>

      {/* Mood Tags */}
      <fieldset disabled={loading}>
        <legend className="text-sm font-medium mb-1.5 block">{t('moods')}</legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleMood(tag)} disabled={loading} aria-pressed={selectedMoods.includes(tag)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                selectedMoods.includes(tag)
                  ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'border-border text-muted-foreground hover:border-amber-400'
              )}
            >
              {moods(tag)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Optional metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={'review-date-'+bookId} className="text-xs font-medium mb-1 block text-muted-foreground">{t('readDate')}</label>
          <input
            type="date" id={'review-date-'+bookId} disabled={loading}
            value={readDate}
            onChange={(e) => setReadDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label htmlFor={'review-edition-'+bookId} className="text-xs font-medium mb-1 block text-muted-foreground">{t('edition')}</label>
          <input
            type="text" id={'review-edition-'+bookId} disabled={loading}
            value={editionRead}
            onChange={(e) => setEditionRead(e.target.value)}
            maxLength={100}
            placeholder={t('editionExample')}
            className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Spoiler Warning */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox" disabled={loading}
          checked={spoilerWarning}
          onChange={(e) => setSpoilerWarning(e.target.checked)}
          className="w-4 h-4 accent-amber-500"
        />
        <span className="text-sm">{t('spoilers')}</span>
      </label>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-amber-500 text-white rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {loading?common('submitting'):t('submit')}
      </button>
    </form>
  );
}
