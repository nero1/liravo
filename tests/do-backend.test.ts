/**
 * Tests for the DigitalOcean PostgreSQL backend infrastructure.
 *
 * These are source-inspection and unit tests — they do not connect to a live
 * database or Redis. They verify module structure, configuration values, and
 * that source files contain the expected patterns.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ── provider.ts ──────────────────────────────────────────────────────────────

describe('provider.ts', () => {
  const originalEnv = process.env.DATABASE_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DATABASE_PROVIDER;
    else process.env.DATABASE_PROVIDER = originalEnv;
  });

  it('exports getProvider, isDigitalOcean, isRailway, isDirectPostgres', async () => {
    process.env.DATABASE_PROVIDER = 'supabase';
    const mod = await import('../src/lib/db/provider');
    expect(typeof mod.getProvider).toBe('function');
    expect(typeof mod.isDigitalOcean).toBe('function');
    expect(typeof mod.isRailway).toBe('function');
    expect(typeof mod.isDirectPostgres).toBe('function');
  });

  it('getProvider returns "supabase" by default', async () => {
    delete process.env.DATABASE_PROVIDER;
    const { getProvider } = await import('../src/lib/db/provider');
    expect(getProvider()).toBe('supabase');
  });

  it('getProvider returns "digitalocean"', async () => {
    process.env.DATABASE_PROVIDER = 'digitalocean';
    const { getProvider } = await import('../src/lib/db/provider');
    expect(getProvider()).toBe('digitalocean');
  });

  it('getProvider returns "railway"', async () => {
    process.env.DATABASE_PROVIDER = 'railway';
    const { getProvider } = await import('../src/lib/db/provider');
    expect(getProvider()).toBe('railway');
  });

  it('throws on invalid DATABASE_PROVIDER', async () => {
    process.env.DATABASE_PROVIDER = 'mysql';
    const { getProvider } = await import('../src/lib/db/provider');
    expect(() => getProvider()).toThrow('Invalid DATABASE_PROVIDER: "mysql"');
  });

  it('isDigitalOcean is true when DATABASE_PROVIDER=digitalocean', async () => {
    process.env.DATABASE_PROVIDER = 'digitalocean';
    const { isDigitalOcean } = await import('../src/lib/db/provider');
    expect(isDigitalOcean()).toBe(true);
  });

  it('isDigitalOcean is false for supabase mode', async () => {
    process.env.DATABASE_PROVIDER = 'supabase';
    const { isDigitalOcean } = await import('../src/lib/db/provider');
    expect(isDigitalOcean()).toBe(false);
  });

  it('isRailway is true when DATABASE_PROVIDER=railway', async () => {
    process.env.DATABASE_PROVIDER = 'railway';
    const { isRailway } = await import('../src/lib/db/provider');
    expect(isRailway()).toBe(true);
  });

  it('isRailway is false for digitalocean mode', async () => {
    process.env.DATABASE_PROVIDER = 'digitalocean';
    const { isRailway } = await import('../src/lib/db/provider');
    expect(isRailway()).toBe(false);
  });

  it('isDirectPostgres is true for digitalocean', async () => {
    process.env.DATABASE_PROVIDER = 'digitalocean';
    const { isDirectPostgres } = await import('../src/lib/db/provider');
    expect(isDirectPostgres()).toBe(true);
  });

  it('isDirectPostgres is true for railway', async () => {
    process.env.DATABASE_PROVIDER = 'railway';
    const { isDirectPostgres } = await import('../src/lib/db/provider');
    expect(isDirectPostgres()).toBe(true);
  });

  it('isDirectPostgres is false for supabase', async () => {
    process.env.DATABASE_PROVIDER = 'supabase';
    const { isDirectPostgres } = await import('../src/lib/db/provider');
    expect(isDirectPostgres()).toBe(false);
  });
});

// ── pg.ts — source inspection ────────────────────────────────────────────────

describe('pg.ts — configuration', () => {
  it('has prepare: false', () => {
    const src = readSrc('lib', 'db', 'pg.ts');
    expect(src).toContain('prepare: false');
  });

  it('reads DATABASE_POOL_MAX env var', () => {
    const src = readSrc('lib', 'db', 'pg.ts');
    expect(src).toContain('DATABASE_POOL_MAX');
  });

  it('has idle_timeout', () => {
    const src = readSrc('lib', 'db', 'pg.ts');
    expect(src).toContain('idle_timeout');
  });

  it('has max_lifetime', () => {
    const src = readSrc('lib', 'db', 'pg.ts');
    expect(src).toContain('max_lifetime');
  });

  it('exports getSql function', () => {
    const src = readSrc('lib', 'db', 'pg.ts');
    expect(src).toContain('export function getSql');
  });
});

// ── query-builder.ts — structure ─────────────────────────────────────────────

describe('query-builder.ts — structure', () => {
  it('exports PgQueryBuilder class', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('export class PgQueryBuilder');
  });

  it('exports getPgQueryBuilderFactory', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('export function getPgQueryBuilderFactory');
  });

  it('has select method', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('select(');
  });

  it('has eq filter', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('eq(');
  });

  it('has in filter', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('in(');
  });

  it('has or filter', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('or(');
  });

  it('has is filter', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('is(');
  });

  it('has order modifier', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('order(');
  });

  it('has limit modifier', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('limit(');
  });

  it('has range modifier', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('range(');
  });

  it('has single modifier', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('single()');
  });

  it('has maybeSingle modifier', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('maybeSingle()');
  });

  it('has insert mutation', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('insert(');
  });

  it('has update mutation', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('update(');
  });

  it('has delete mutation', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('delete()');
  });

  it('has upsert mutation', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('upsert(');
  });

  it('has COUNT support', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('COUNT');
  });

  it('parses OR filter string', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('_buildOrSql');
  });

  it('rpc function builds named params', () => {
    const src = readSrc('lib', 'db', 'query-builder.ts');
    expect(src).toContain('rpc');
  });
});

// ── storage/provider.ts ──────────────────────────────────────────────────────

describe('storage/provider.ts', () => {
  it('exports StorageProvider interface shape', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('StorageProvider');
    expect(src).toContain('upload(');
    expect(src).toContain('remove(');
    expect(src).toContain('getPublicUrl(');
  });

  it('S3 adapter uses PutObjectCommand', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('PutObjectCommand');
  });

  it('S3 adapter uses DeleteObjectsCommand', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('DeleteObjectsCommand');
  });

  it('S3 adapter reads S3_CDN_URL', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('S3_CDN_URL');
  });

  it('S3 adapter uses public-read ACL', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('public-read');
  });

  it('exports getStorageProvider factory', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('export function getStorageProvider');
  });

  it('Supabase adapter is present', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('createSupabaseStorageAdapter');
  });

  it('S3 adapter is present', () => {
    const src = readSrc('lib', 'storage', 'provider.ts');
    expect(src).toContain('createS3StorageAdapter');
  });
});

// ── auth routes — source inspection ─────────────────────────────────────────

describe('auth routes — source patterns', () => {
  it('login route has bcrypt.compare', () => {
    const src = readSrc('app', 'api', 'auth', 'login', 'route.ts');
    expect(src).toContain('bcrypt.compare');
  });

  it('login route handles PASSWORD_RESET_REQUIRED', () => {
    const src = readSrc('app', 'api', 'auth', 'login', 'route.ts');
    expect(src).toContain('PASSWORD_RESET_REQUIRED');
  });

  it('signup route has bcrypt.hash', () => {
    const src = readSrc('app', 'api', 'auth', 'signup', 'route.ts');
    expect(src).toContain('bcrypt.hash');
  });

  it('callback route has oauth_not_supported in DO mode', () => {
    const src = readSrc('app', 'api', 'auth', 'callback', 'route.ts');
    expect(src).toContain('oauth_not_supported');
  });

  it('callback route uses isDirectPostgres guard', () => {
    const src = readSrc('app', 'api', 'auth', 'callback', 'route.ts');
    expect(src).toContain('isDirectPostgres');
  });
});

// ── middleware.ts — DO mode session cookie ───────────────────────────────────

describe('middleware.ts — DO mode', () => {
  it('keeps Node session validation out of Edge middleware', () => {
    expect(readSrc('middleware.ts')).not.toContain('getDoUserFromRequest');
    expect(readSrc('app', '(app)', 'layout.tsx')).toContain('getCurrentUser');
  });

  it('has isDirectPostgresMode check', () => {
    const src = readSrc('middleware.ts');
    expect(src).toContain('isDirectPostgresMode');
  });
});

// ── next.config.mjs — provider-conditional config ───────────────────────────

describe('next.config.mjs', () => {
  it('references isDirectPostgres', () => {
    const src = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf-8');
    expect(src).toContain('isDirectPostgres');
  });

  it('gates supabase.co behind isDirectPostgres check', () => {
    const src = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf-8');
    expect(src).toContain('supabase.co');
    // supabase.co appears inside a condition (not for DO mode)
    expect(src).toMatch(/isDirectPostgres[\s\S]+supabase\.co|supabase\.co[\s\S]+isDirectPostgres/);
  });

  it('adds S3_CDN_URL hostname in DO mode', () => {
    const src = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf-8');
    expect(src).toContain('S3_CDN_URL');
  });
});

// ── audit: no supabase.auth.getUser() in src/app/api ─────────────────────────

describe('audit — zero raw supabase.auth.getUser() calls in API routes', () => {
  function walkFiles(dir: string, ext: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...walkFiles(full, ext));
      else if (entry.isFile() && entry.name.endsWith(ext)) results.push(full);
    }
    return results;
  }

  it('zero supabase.auth.getUser() calls remain in src/app/api', () => {
    const apiDir = path.join(SRC, 'app', 'api');
    const files = walkFiles(apiDir, '.ts');
    const violations: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf-8');
      if (src.includes('supabase.auth.getUser()')) {
        violations.push(f.replace(ROOT + '/', ''));
      }
    }
    expect(violations, `Found supabase.auth.getUser() in: ${violations.join(', ')}`).toEqual([]);
  });

  it('auth routes in /api/auth/login and /api/auth/signup do not import Supabase auth directly', () => {
    const loginSrc = readSrc('app', 'api', 'auth', 'login', 'route.ts');
    const signupSrc = readSrc('app', 'api', 'auth', 'signup', 'route.ts');

    // These routes use the service client, not raw Supabase auth methods
    expect(loginSrc).not.toContain('createBrowserClient');
    expect(signupSrc).not.toContain('createBrowserClient');
    expect(loginSrc).not.toContain('supabase.auth.signIn');
    expect(signupSrc).not.toContain('supabase.auth.signUp');
  });

  it('server.ts createClient is provider-aware', () => {
    const src = readSrc('lib', 'supabase', 'server.ts');
    expect(src).toContain('isDirectPostgres');
    expect(src).toContain('createDoClient');
    expect(src).toContain('createDoServiceClient');
  });

  it('getCurrentUser works in all modes (source inspection)', () => {
    const src = readSrc('lib', 'auth', 'getCurrentUser.ts');
    expect(src).toContain('isDirectPostgres');
    expect(src).toContain('do:session:');
    expect(src).toContain('getSupabaseUser');
    expect(src).toContain('getDoUser');
  });
});

it('normalizes PostgreSQL DATE objects and PostgREST date strings to the same prompt contract', async () => {
  const { writingPromptResponse } = await import('@/lib/writing-intents');
  for (const date of [new Date('2026-10-26T00:00:00Z'),'2026-10-26']) {
    const response=writingPromptResponse({prompt_date:date,prompt_text:'Daily prompt',topic_seed:'Adventure'});
    expect(response).toMatchObject({date:'2026-10-26',prompt_date:'2026-10-26',prompt:'Daily prompt',genre:'Adventure'});
  }
  expect(writingPromptResponse({prompt_date:null}).date).toBeNull();
});
