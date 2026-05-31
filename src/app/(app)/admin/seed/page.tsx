'use client';

import { useState } from 'react';

interface ActionResult {
  success: boolean;
  message: string;
}

export default function AdminSeedPage() {
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const runAction = async (key: string, url: string) => {
    setLoading((l) => ({ ...l, [key]: true }));
    try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json() as { message?: string; error?: string; inserted?: number; skipped?: number };
      if (res.ok) {
        const detail = typeof data.inserted === 'number'
          ? ` (${data.inserted} inserted, ${data.skipped ?? 0} skipped)`
          : '';
        setResults((r) => ({
          ...r,
          [key]: { success: true, message: (data.message ?? 'Done') + detail },
        }));
      } else {
        setResults((r) => ({
          ...r,
          [key]: { success: false, message: data.error ?? 'Unknown error' },
        }));
      }
    } catch (e) {
      setResults((r) => ({
        ...r,
        [key]: { success: false, message: e instanceof Error ? e.message : 'Error' },
      }));
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
    }
  };

  const actions = [
    {
      key: 'editors-account',
      label: 'Create Liravo Editors Account',
      description: 'Creates the @liravo_editors system account used for all platform-curated content. Run this first.',
      url: '/api/admin/seed/editors-account',
      step: 1,
    },
    {
      key: 'books',
      label: 'Seed Books',
      description: 'Inserts 100 curated books across all genres (Literary Fiction, Thriller, Sci-Fi, Fantasy, Romance, Historical, Nonfiction, Classics, Craft). Idempotent — skips existing ISBN-13s.',
      url: '/api/admin/seed/books',
      step: 2,
    },
    {
      key: 'reading-lists',
      label: 'Seed Reading Lists',
      description: 'Creates 20 SEO-optimised reading lists owned by @liravo_editors. Requires books and editors account to already exist.',
      url: '/api/admin/seed/reading-lists',
      step: 3,
    },
    {
      key: 'writing-prompts',
      label: 'Seed Writing Prompts (63 days, static)',
      description: 'Seeds 63 days of pre-written writing prompts starting from tomorrow. No AI keys required. Skips dates that already have a prompt.',
      url: '/api/admin/seed/writing-prompts',
      step: 4,
    },
    {
      key: 'writing-challenges',
      label: 'Seed Writing Challenges',
      description: 'Creates 4 weekly writing challenges and 2 monthly challenges. Idempotent — skips titles that already exist.',
      url: '/api/admin/seed/writing-challenges',
      step: 5,
    },
    {
      key: 'generate-prompts',
      label: 'Generate AI Writing Prompts (7 days)',
      description: 'Generates 7 days of AI writing prompts via DeepSeek/Gemini. Requires AI API keys. Use after the static seed to extend coverage.',
      url: '/api/cron/generate-prompts',
      step: null,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Seed Content</h1>
      <p className="text-muted-foreground text-sm mb-4">
        Initialise platform content for a fresh deployment. All actions are idempotent — safe to run multiple times.
      </p>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 mb-6">
        <strong>Recommended order:</strong> Run the numbered steps in sequence — each depends on the previous.
        The &ldquo;Generate AI Prompts&rdquo; action has no step number and can be run at any time after setup.
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-4">
        <h2 className="font-semibold mb-1">Liravo Editors Account</h2>
        <p className="text-sm text-muted-foreground mb-3">
          The <strong>@liravo_editors</strong> account is the platform&apos;s editorial voice — it owns all seeded reading lists, reviews, and quotes. It is created with a service-role bypass of RLS and is not accessible as a regular user account.
        </p>
        <div className="text-xs text-muted-foreground font-mono">
          username: liravo_editors &nbsp;|&nbsp; display_name: Liravo Editors
        </div>
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
              {loading[action.key] ? 'Running…' : 'Run'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
