'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ActionResult {
  success: boolean;
  message: string;
}

export default function AdminSeedPage() {
  const t = useTranslations('admin');
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const runAction = async (key: string, url: string) => {
    setLoading((l) => ({ ...l, [key]: true }));
    try {
      const cron = url.startsWith('/api/cron/');
      const res = await fetch(cron ? '/api/admin/cron-status' : url, { method: 'POST', ...(cron ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job: url.split('/').at(-1) }) } : {}) });
      const data = await res.json() as { message?: string; error?: string; inserted?: number; skipped?: number;repaired?:number;errors?:string[];pending?:number };
      if (res.ok) {
        const detail = typeof data.inserted === 'number'
          ? t('seedResult', { inserted: data.inserted, skipped: data.skipped ?? 0 })
          : '';
        const repairs=data.repaired?t('seedRepaired',{count:data.repaired}):'';
        setResults((r) => ({
          ...r,
          [key]: { success: true, message: (data.message ?? t('done')) + detail+repairs },
        }));
      } else {
        setResults((r) => ({
          ...r,
          [key]: { success: false, message: t('actionFailed')+(data.errors?.length?' '+data.errors[0]:'') },
        }));
      }
    } catch (e) {
      setResults((r) => ({
        ...r,
        [key]: { success: false, message: e instanceof Error ? e.message : t('actionFailed') },
      }));
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
    }
  };

  const actions = [
    {
      key: 'editors-account',
      label: t('createLiravoEditorsAccount'),
      description: t('editorsSeedDescription'),
      url: '/api/admin/seed/editors-account',
      step: 1,
    },
    {
      key: 'books',
      label: t('seedBooks'),
      description: t('booksSeedDescription'),
      url: '/api/admin/seed/books',
      step: 2,
    },
    {
      key: 'reading-lists',
      label: t('seedReadingLists'),
      description: t('listsSeedDescription'),
      url: '/api/admin/seed/reading-lists',
      step: 3,
    },
    {
      key: 'writing-prompts',
      label: t('seedWritingPrompts63DaysStatic'),
      description: t('promptsSeedDescription'),
      url: '/api/admin/seed/writing-prompts',
      step: 4,
    },
    {
      key: 'writing-challenges',
      label: t('seedWritingChallenges'),
      description: t('challengesSeedDescription'),
      url: '/api/admin/seed/writing-challenges',
      step: 5,
    },
    {
      key: 'generate-prompts',
      label: t('generateAIWritingPrompts7Days'),
      description: t('aiPromptsSeedDescription'),
      url: '/api/cron/generate-prompts',
      step: null,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">{t('seedContent')}</h1>
      <p className="text-muted-foreground text-sm mb-4">{t('seedDescription')}</p>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 mb-6">
        <strong>{t('recommendedOrder')}</strong>{' '}{t('seedOrder')}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-4">
        <h2 className="font-semibold mb-1">{t('liravoEditorsAccount')}</h2>
        <p className="text-sm text-muted-foreground mb-3">{t('editorsSummary')}</p>
        <div className="text-xs text-muted-foreground font-mono">{t('editorIdentity', { username: 'liravo_editors', name: 'Liravo Editors' })}</div>
      </div>

      <div className="space-y-3">
        {actions.map((action) => (
          <div
            key={action.key}
            className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {action.step !== null && (
                  <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground text-xs font-bold">
                    {action.step}
                  </span>
                )}
                <p className="font-medium text-sm">{action.label}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-7">{action.description}</p>
              {results[action.key] && (
                <p
                  className={`text-xs mt-2 ml-7 ${
                    results[action.key].success ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                  }`}
                >
                  {results[action.key].success ? '✓ ' : '✗ '}
                  {results[action.key].message}
                </p>
              )}
            </div>
            <button
              onClick={() => runAction(action.key, action.url)}
              disabled={loading[action.key]}
              className="shrink-0 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {loading[action.key] ? t('running') : t('run')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
