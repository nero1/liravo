import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createTranslator } from 'next-intl';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';
import * as contracts from '@/lib/feature-flag-contracts';

const flag = { id: 'flag', name: 'google_auth', enabled: true, description: null, updated_at: '2026-11-05T00:00:00Z' };
const other = { ...flag, id: 'other-flag', name: 'telegram_auth' };
const snapshot = (flags = [flag, other], actorId = 'admin') => Response.json({ actorId, flags });
function mount(providersOnly = false) {
  const slots: any[] = [], effects: (() => void)[] = [], fetch = vi.fn(), exports: any = {};
  let cursor = 0;
  const same = (a: any[], b: any[]) => a?.length === b.length && a.every((value, index) => value === b[index]);
  runInNewContext(ts.transpileModule(readFileSync('src/lib/client/useAdminFeatureFlags.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, fetch, AbortController, require(name: string) {
      if (name === '@/lib/feature-flag-contracts') return contracts;
      if (name === 'react') return {
        useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
        useRef(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
        useCallback(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
        useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
      };
      throw Error(name);
    },
  });
  const render = (actor = 'admin') => { cursor = 0; return exports.useAdminFeatureFlags(actor, providersOnly); };
  return { fetch, render, start: (actor = 'admin') => { render(actor); effects.splice(0).forEach(effect => effect()); }, unmount: () => slots.forEach(slot => slot?.cleanup?.()) };
}

it('keeps failed reads unknown, exposes translated error keys and recovers on retry', async () => {
  const view = mount(); view.fetch.mockRejectedValueOnce(Error('Failed to fetch')); view.start();
  await vi.waitFor(() => expect(view.render().loading).toBe(false));
  expect(view.render()).toMatchObject({ flags: null, error: 'loadFlagsFailed' });
  view.fetch.mockResolvedValueOnce(snapshot()); await view.render().reload();
  expect(view.render()).toMatchObject({ flags: [flag, other], error: null });
  expect(view.fetch.mock.calls[1][1]).toMatchObject({ cache: 'no-store', headers: { 'X-Liravo-Actor': 'admin' } });
});

it('rejects missing, duplicate, malformed, foreign and incomplete provider snapshots', async () => {
  for (const response of [Response.json({ flags: [] }), snapshot([], 'other'), snapshot([{ ...flag, enabled: 'true' } as any]), snapshot([flag, flag]), snapshot([{ ...flag, updated_at: 'invalid' }]), snapshot([flag])]) {
    const view = mount(true); view.fetch.mockResolvedValueOnce(response); view.start();
    await vi.waitFor(() => expect(view.render().loading).toBe(false));
    expect(view.render()).toMatchObject({ flags: null, error: 'loadFlagsFailed' });
  }
  const view = mount(); view.fetch.mockResolvedValueOnce(snapshot([])); view.start();
  await vi.waitFor(() => expect(view.render().flags).toEqual([]));
});

it('confirms interrupted saves from current state and serializes simultaneous switch events', async () => {
  const view = mount(); view.fetch.mockResolvedValueOnce(snapshot()); view.start();
  await vi.waitFor(() => expect(view.render().loading).toBe(false));
  view.fetch.mockRejectedValueOnce(Error('Lost response')).mockResolvedValueOnce(snapshot([{ ...flag, enabled: false }, other]));
  const change = view.render(); await Promise.all([change.toggle(flag), change.toggle(flag)]);
  expect(view.fetch).toHaveBeenCalledTimes(3);
  expect(view.render()).toMatchObject({ saving: false, error: null, flags: [{ ...flag, enabled: false }, other] });
  expect(view.fetch.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ name: 'google_auth', enabled: false }), headers: { 'X-Liravo-Actor': 'admin' } });
});

it('rejects forged acknowledgements, preserves provider conflicts and locks unknown saved state until retry', async () => {
  const view = mount(); view.fetch.mockResolvedValueOnce(snapshot()); view.start();
  await vi.waitFor(() => expect(view.render().loading).toBe(false));
  view.fetch.mockResolvedValueOnce(Response.json({ updated: true, changed: true, actorId: 'other', name: 'google_auth', enabled: false })).mockResolvedValueOnce(snapshot([{ ...flag, enabled: false }, other]));
  await view.render().toggle(flag); expect(view.render().error).toBe('updateFailed');
  view.fetch.mockResolvedValueOnce(Response.json({ code: 'P1006' }, { status: 409 })).mockResolvedValueOnce(snapshot([{ ...flag, enabled: false }, other]));
  await view.render().toggle(other); expect(view.render().error).toBe('lastProvider');
  view.fetch.mockRejectedValueOnce(Error('Lost response')).mockRejectedValueOnce(Error('Read unavailable'));
  await view.render().toggle(other); expect(view.render()).toMatchObject({ flags: null, error: 'loadFlagsFailed', saving: false });
  const count = view.fetch.mock.calls.length; await view.render().toggle(other); expect(view.fetch).toHaveBeenCalledTimes(count);
});

it('ignores late reads and saves after account changes or unmount', async () => {
  const view = mount(); let finish!: (value: Response) => void;
  view.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); view.start();
  view.fetch.mockResolvedValueOnce(snapshot([flag, other], 'other')); view.start('other');
  finish(snapshot([{ ...flag, enabled: false }, other])); await vi.waitFor(() => expect(view.render('other').loading).toBe(false));
  expect(view.render('other').flags).toEqual([flag, other]);
  // Unmount while a mutation is pending: it must not start a recovery read.
  let save!: (value: Response) => void; view.fetch.mockResolvedValueOnce(snapshot()); view.start();
  await vi.waitFor(() => expect(view.render().loading).toBe(false));
  view.fetch.mockReturnValueOnce(new Promise(resolve => { save = resolve; })); const task = view.render().toggle(flag);
  const calls = view.fetch.mock.calls.length; view.unmount(); save(Response.json({ updated: true })); await task;
  expect(view.fetch).toHaveBeenCalledTimes(calls);
});

it('renders localized unavailable states with retry instead of empty or fabricated provider switches', () => {
  for (const [locale, messages] of Object.entries({ en, fr, de })) {
    const exports: any = {}, translations = (namespace: string) => createTranslator({ locale, messages, namespace: namespace as never });
    runInNewContext(ts.transpileModule(readFileSync('src/components/admin/FeatureFlags.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, require(name: string) {
        if (name === 'react/jsx-runtime') return { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) };
        if (name === 'next-intl') return { useTranslations: translations, useFormatter: () => ({}) };
        if (name === '@/lib/client/useAdminFeatureFlags') return { useAdminFeatureFlags: () => ({ flags: null, loading: false, saving: false, error: 'loadFlagsFailed', reload: vi.fn(), toggle: vi.fn() }) };
        throw Error(name);
      },
    });
    for (const providersOnly of [true, false]) {
      const tree = JSON.stringify(exports.default({ actorId: 'admin', providersOnly }));
      expect(tree).toContain(translations('admin')('loadFlagsFailed' as never));
      expect(tree).toContain(translations('common')('retry' as never));
      expect(tree).not.toContain(translations('admin')('noFeatureFlagsFound' as never));
      expect(tree).not.toContain('aria-checked');
    }
  }
});
