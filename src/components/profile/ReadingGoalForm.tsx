'use client';

import { useState,useRef,useEffect } from 'react';
import {useTranslations} from 'next-intl';
import { cn } from '@/lib/utils';

interface ReadingGoalFormProps {
  userId: string;
  currentGoal: number | null;
}

export function ReadingGoalForm(props:ReadingGoalFormProps){return <OwnedReadingGoalForm key={props.userId} {...props}/>;}
function OwnedReadingGoalForm({userId,currentGoal}:ReadingGoalFormProps){
  const t=useTranslations('readingGoalForm'),common=useTranslations('common'),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const [goal, setGoal] = useState(currentGoal?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();if(busy.current)return;
    const num=Number(goal);
    if (!Number.isInteger(num)||num<1||num>10000) {
      setError(t('invalid'));
      return;
    }
    setError(null);
    clearTimeout(timer.current);setSuccess(false);busy.current=true;setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/reading-goal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: num }),
      });
      if (res.ok) {
        const result=await res.json();if(result.annual_reading_goal!==num)throw new Error('Invalid goal receipt');
        setSuccess(true);
        timer.current=setTimeout(() => setSuccess(false), 2000);
      } else {
        setError(t('failed'));
      }
    } catch {
      setError(t('failed'));
    } finally {
      busy.current=false;setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor={'reading-goal-'+userId} className="text-sm font-medium">
          {t('label')}
        </label>
        <input
          id={'reading-goal-'+userId} disabled={loading}
          type="number"
          min={1}
          max={10000}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={t('example')}
          className={cn(
            'w-20 text-sm px-2 py-1.5 border border-border rounded-lg bg-background',
            'focus:outline-none focus:ring-1 focus:ring-amber-500'
          )}
        />
        <span className="text-sm text-muted-foreground">{t('unit')}</span>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {loading?common('saving'):common('save')}
      </button>

      {success && <span role="status" className="text-sm text-amber-600 font-medium">{t('saved')}</span>}
      {error && <span role="alert" className="text-sm text-red-500">{error}</span>}
    </form>
  );
}
