'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFeatureFlagsSchema, type AdminFeatureFlag } from '@/lib/feature-flag-contracts';

export function useAdminFeatureFlags(actorId: string, providersOnly: boolean) {
  const [flags, setFlags] = useState<AdminFeatureFlag[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'loadFlagsFailed' | 'updateFailed' | 'lastProvider' | null>(null);
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);

  const read = useCallback(async (signal: AbortSignal) => {
    const res = await fetch('/api/admin/feature-flags', { cache: 'no-store', headers: { 'X-Liravo-Actor': actorId }, signal });
    if (!res.ok) throw new Error('Flags unavailable');
    const data = await res.json();
    const parsed = adminFeatureFlagsSchema.safeParse(data?.flags);
    if (data?.actorId !== actorId || !parsed.success || (providersOnly && !['google_auth', 'telegram_auth'].every(name => parsed.data.some(flag => flag.name === name)))) throw new Error('Invalid flags');
    return parsed.data;
  }, [actorId, providersOnly]);

  const reload = useCallback(async () => {
    if (busy.current) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    busy.current = true;
    setLoading(true);
    setFlags(null);
    setError(null);
    try {
      const current = await read(controller.signal);
      if (!controller.signal.aborted) setFlags(current);
    } catch {
      if (!controller.signal.aborted) setError('loadFlagsFailed');
    } finally {
      if (!controller.signal.aborted) { busy.current = false; setLoading(false); }
    }
  }, [read]);

  useEffect(() => {
    busy.current = false;
    setSaving(false);
    void reload();
    return () => { active.current?.abort(); };
  }, [reload]);

  const toggle = async (flag: AdminFeatureFlag) => {
    if (busy.current || flags === null) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    busy.current = true;
    setSaving(true);
    setError(null);
    const enabled = !flag.enabled;
    let failure: 'lastProvider' | 'updateFailed' | null = null;
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Liravo-Actor': actorId },
        body: JSON.stringify({ name: flag.name, enabled }), signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) failure = data?.code === 'P1006' ? 'lastProvider' : 'updateFailed';
      else if (data?.updated !== true || typeof data?.changed !== 'boolean' || data?.actorId !== actorId || data?.name !== flag.name || data?.enabled !== enabled) failure = 'updateFailed';
    } catch {
      // A fresh read below resolves an interrupted desired-state change.
    }
    if (controller.signal.aborted) return;
    try {
      const current = await read(controller.signal);
      if (!controller.signal.aborted) {
        setFlags(current);
        setError(failure ?? (current.find(item => item.name === flag.name)?.enabled === enabled ? null : 'updateFailed'));
      }
    } catch {
      if (!controller.signal.aborted) { setFlags(null); setError('loadFlagsFailed'); }
    } finally {
      if (!controller.signal.aborted) { busy.current = false; setSaving(false); }
    }
  };

  return { flags, loading, saving, error, reload, toggle };
}
