'use client';

import { useState, useEffect } from 'react';

interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export default function AdminFeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (!res.ok) throw new Error('Failed to load flags');
      const data = await res.json() as { flags: FeatureFlag[] };
      setFlags(data.flags ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFlags(); }, []);

  const handleToggle = async (flag: FeatureFlag) => {
    setTogglingId(flag.id);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: flag.name, enabled: !flag.enabled }),
      });
      if (!res.ok) throw new Error('Failed to update flag');
      await fetchFlags();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Feature Flags</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Toggle features without redeployment. Redis cache invalidated immediately on toggle.
      </p>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
            >
              <div>
                <p className="font-medium text-sm">{flag.name}</p>
                {flag.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Updated {new Date(flag.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle(flag)}
                disabled={togglingId === flag.id}
                aria-label={`${flag.enabled ? 'Disable' : 'Enable'} ${flag.name}`}
                className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
                  flag.enabled ? 'bg-accent' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    flag.enabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          ))}

          {flags.length === 0 && (
            <p className="text-muted-foreground text-sm">No feature flags found.</p>
          )}
        </div>
      )}
    </div>
  );
}
