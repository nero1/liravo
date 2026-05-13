'use client';

import { useState } from 'react';

interface ActionResult {
  success: boolean;
  message: string;
}

export default function AdminSeedPage() {
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const runAction = async (key: string, url: string, method = 'POST') => {
    setLoading((l) => ({ ...l, [key]: true }));
    try {
      const res = await fetch(url, { method });
      const data = await res.json() as { message?: string; error?: string; created?: boolean };
      if (res.ok) {
        setResults((r) => ({
          ...r,
          [key]: { success: true, message: data.message ?? 'Done' },
        }));
      } else {
        setResults((r) => ({
          ...r,
          [key]: { success: false, message: data.error ?? 'Error' },
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
      description:
        'Creates the special @liravo_editors system account used for platform-curated content.',
      url: '/api/admin/seed/editors-account',
    },
    {
      key: 'generate-prompts',
      label: 'Seed Writing Prompts (7 days)',
      description: 'Generates 7 days of AI writing prompts for the community.',
      url: '/api/cron/generate-prompts',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Seed Content</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Use these tools to initialise platform content. Safe to run multiple times — idempotent where noted.
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold mb-1">Liravo Editors Account</h2>
          <p className="text-sm text-muted-foreground mb-3">
            The <strong>@liravo_editors</strong> account (display name: &quot;Liravo Editors&quot;) is the
            platform&apos;s voice for curated reading lists, official writing prompts, and community
            announcements. It bypasses RLS and is created via the service role.
          </p>
          <div className="text-xs text-muted-foreground mb-1 font-mono">
            username: liravo_editors | display_name: Liravo Editors
          </div>
        </div>

        {actions.map((action) => (
          <div
            key={action.key}
            className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div>
              <p className="font-medium text-sm">{action.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              {results[action.key] && (
                <p
                  className={`text-xs mt-2 ${
                    results[action.key].success ? 'text-green-600' : 'text-destructive'
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
              {loading[action.key] ? 'Running...' : 'Run'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
