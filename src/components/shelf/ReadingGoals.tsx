'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {useTranslations} from 'next-intl';
import {validReadingGoalData,validReadingGoal} from '@/lib/client/reading-goal';
import type {ReadingGoalData} from '@/types/database';
import Link from 'next/link';

const PRESET_GOALS = [6, 12, 24, 36, 52, 100];

const MILESTONES = [
  { pct: 25, label: '25%', emoji: '🌱' },
  { pct: 50, label: '50%', emoji: '🌿' },
  { pct: 75, label: '75%', emoji: '🌳' },
  { pct: 100, label: '100%', emoji: '🏆' },
];

export function ReadingGoals({actorId}:{actorId:string}) {
  const t=useTranslations('readingGoals'),form=useTranslations('readingGoalForm'),common=useTranslations('common');
  const [failed,setFailed]=useState(false),[saveFailed,setSaveFailed]=useState(false),lock=useRef(false),alive=useRef(true),read=useRef<AbortController|null>(null);
  const year=new Date().getUTCFullYear();
  const [data, setData] = useState<ReadingGoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [editing, setEditing] = useState(false);

  const load=useCallback(async()=>{
    read.current?.abort();const current=new AbortController();read.current=current;setLoading(true);setFailed(false);
    try{const response=await fetch('/api/reading-goals',{cache:'no-store',signal:current.signal,headers:{'X-Liravo-Actor':actorId}}),result=await response.json();if(!response.ok||!validReadingGoalData(result,actorId,year))throw Error();if(alive.current&&!current.signal.aborted){setData(result);setTargetInput(String(result.goal?.target_books??''));}}
    catch{if(alive.current&&!current.signal.aborted)setFailed(true);}finally{if(alive.current&&!current.signal.aborted)setLoading(false);}
  },[actorId,year]);
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;read.current?.abort();};},[load]);
  const targetNumber=Number(targetInput),validTarget=/^[0-9]+$/.test(targetInput)&&Number.isSafeInteger(targetNumber)&&targetNumber>=1&&targetNumber<=10000;
  async function handleSave(){
    if(lock.current||!validTarget)return;lock.current=true;setSaving(true);setSaveFailed(false);
    try{
      let result;
      try{const response=await fetch('/api/reading-goals',{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':actorId},body:JSON.stringify({target_books:targetNumber,year})});result=await response.json();if(!response.ok||result.actorId!==actorId||!validReadingGoal(result.goal,actorId,year)||result.goal.target_books!==targetNumber)throw Error();}
      catch{const response=await fetch('/api/reading-goals',{cache:'no-store',headers:{'X-Liravo-Actor':actorId}});result=await response.json();if(!response.ok||!validReadingGoalData(result,actorId,year)||result.goal?.target_books!==targetNumber)throw Error();}
      if(alive.current){setData(previous=>previous?{...previous,goal:result.goal,progress:{...previous.progress,percentage:Math.min(100,Math.round(previous.progress.books_read/targetNumber*100))}}:null);setEditing(false);}
    }catch{if(alive.current)setSaveFailed(true);}finally{lock.current=false;if(alive.current)setSaving(false);}
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if(failed||!data)return <div className="max-w-xl mx-auto px-4 py-8"><h1 className="font-display text-2xl font-bold">{t('title',{year})}</h1><p role="alert">{t('loadFailed')}</p><button onClick={()=>void load()} className="underline">{common('retry')}</button></div>;
  const {goal,progress}=data;
  const pct = progress.percentage ?? 0;
  const booksRead = progress.books_read;
  const target = goal?.target_books ?? 0;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{t('title',{year:progress.year})}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('subtitle')}
        </p>
      </div>

      {goal && !editing ? (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          {/* Progress ring / bar */}
          <div className="text-center space-y-2">
            <div className="text-5xl font-bold text-accent">{pct}%</div>
            <p className="text-muted-foreground text-sm">
              {t('progress',{count:booksRead,target})}
            </p>
          </div>

          {/* Progress bar */}
          <div role="progressbar" aria-label={t('title',{year:progress.year})} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Milestones */}
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map((m) => {
              const reached = pct >= m.pct;
              return (
                <div
                  key={m.pct}
                  className={`rounded-lg p-2 text-center ${reached ? 'bg-accent/10 border border-accent/30' : 'bg-muted border border-border'}`}
                >
                  <div className={`text-xl ${reached ? '' : 'grayscale opacity-40'}`}>{m.emoji}</div>
                  <div className={`text-xs font-medium mt-0.5 ${reached ? 'text-accent' : 'text-muted-foreground'}`}>{m.label}</div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {setSaveFailed(false);setEditing(true);}}
              className="flex-1 rounded-lg border border-border text-sm py-2 hover:bg-muted transition-colors"
            >
              {t('change')}
            </button>
            <Link
              href="/shelf/have_read"
              className="flex-1 rounded-lg bg-accent text-white text-sm font-medium py-2 text-center hover:opacity-90 transition-opacity"
            >
              {t('viewBooks')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-semibold">
            {t(goal?'updateTitle':'setTitle')}
          </h2>

          {/* Preset buttons */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t('popular')}</p>
            <div className="flex gap-2 flex-wrap">
              {PRESET_GOALS.map((n) => (
                <button
                  key={n}
                  disabled={saving} onClick={() => setTargetInput(String(n))}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    targetInput === String(n)
                      ? 'border-accent bg-accent/10 text-accent font-medium'
                      : 'border-border text-muted-foreground hover:border-accent'
                  }`}
                >
                  {t('books',{count:n})}
                  {n === 12 && <span className="ml-1 text-xs opacity-70">{t('monthly')}</span>}
                  {n === 52 && <span className="ml-1 text-xs opacity-70">{t('weekly')}</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="goal-target" className="block text-sm font-medium mb-1">{form('label')}</label>
            <div className="flex gap-2">
              <input
                id="goal-target" type="number" step={1}
                min={1}
                max={10000}
                value={targetInput}
                disabled={saving} onChange={(e) => setTargetInput(e.target.value)}
                placeholder={form('example')}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="flex items-center text-sm text-muted-foreground">{form('unit')}</span>
            </div>
          </div>

          {targetInput&&!validTarget&&<p role="alert" className="text-sm text-destructive">{form('invalid')}</p>}
          {saveFailed&&<p role="alert" className="text-sm text-destructive">{form('failed')}</p>}
          <div className="flex gap-2">
            {goal && (
              <button
                disabled={saving} onClick={() => setEditing(false)}
                className="flex-1 rounded-lg border border-border text-sm py-2 hover:bg-muted transition-colors"
              >
                {common('cancel')}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !validTarget}
              className="flex-1 rounded-lg bg-accent text-white text-sm font-medium py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving?common('saving'):t(goal?'update':'set')}
            </button>
          </div>
        </div>
      )}

      {/* Encouragement */}
      {goal && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {pct >= 100
              ? t('complete')
              : pct >= 75
              ? t('almost')
              : pct >= 50
              ? t('half')
              : pct >= 25
              ? t('start')
              : target > 0
              ? t('remaining',{count:target-booksRead})
              : t('subtitle')}
          </p>
        </div>
      )}
    </div>
  );
}
