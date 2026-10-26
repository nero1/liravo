import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { languageAlternates } from '@/lib/metadata';
import { middleware } from '@/middleware';

it('links every supported language to a resolvable page variant', () => {
  const metadata = languageAlternates('/book/123');
  expect(metadata?.canonical).toMatch(/\/book\/123$/);
  expect(metadata?.languages).toMatchObject({ en: expect.stringMatching(/\?lang=en$/), fr: expect.stringMatching(/\?lang=fr$/), de: expect.stringMatching(/\?lang=de$/) });
});

it('resolves a language URL without trusting an injected internal header', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  try {
    const request = new NextRequest('https://app.test/user/reader?lang=fr', { headers: { 'x-liravo-locale': 'de' } });
    const response = await middleware(request);
    expect(response.headers.get('x-middleware-request-x-liravo-locale')).toBe('fr');
    const invalid = await middleware(new NextRequest('https://app.test/user/reader?lang=invalid', { headers: { 'x-liravo-locale': 'de' } }));
    expect(invalid.headers.get('x-middleware-request-x-liravo-locale')).toBe('en');
  } finally { vi.unstubAllEnvs(); }
});
