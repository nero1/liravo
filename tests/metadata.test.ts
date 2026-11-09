import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { languageAlternates } from '@/lib/metadata';
import { proxy as middleware } from '@/proxy';
import {publicAppPath} from '@/lib/public-routes';

it('allows public content while keeping private and reserved app routes authenticated',()=>{
 for(const path of['/book/fixture','/author/writer','/lists/fixture'])expect(publicAppPath(path)).toBe(true);
 for(const path of['/shelf','/write','/author/qa','/author/analytics','/author/arcs/new','/lists/new','/admin',''])expect(publicAppPath(path)).toBe(false);
});

it('links every supported language to a resolvable page variant', () => {
  const metadata = languageAlternates('/book/123');
  expect(metadata?.canonical).toMatch(/\/book\/123$/);
  expect(metadata?.languages).toMatchObject({ en: expect.stringMatching(/\?lang=en$/), fr: expect.stringMatching(/\?lang=fr$/), de: expect.stringMatching(/\?lang=de$/) });
});

it('resolves a language URL without trusting an injected internal header', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  try {
    const request = new NextRequest('https://app.test/user/reader?lang=fr', { headers: { 'x-liravo-locale': 'de','x-liravo-pathname':'/admin' } });
    const response = await middleware(request);
    expect(response.headers.get('x-middleware-request-x-liravo-locale')).toBe('fr');
    expect(response.headers.get('x-middleware-request-x-liravo-pathname')).toBe('/user/reader');
    const invalid = await middleware(new NextRequest('https://app.test/user/reader?lang=invalid', { headers: { 'x-liravo-locale': 'de' } }));
    expect(invalid.headers.get('x-middleware-request-x-liravo-locale')).toBe('en');
  } finally { vi.unstubAllEnvs(); }
});
