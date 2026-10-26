/**
 * DO-mode drop-in replacement for the Supabase server client.
 *
 * Returns an object that mirrors the subset of SupabaseClient used across this
 * codebase so existing API routes work without modification:
 *   - supabase.auth.getUser()
 *   - supabase.auth.signOut()
 *   - supabase.from(table).*
 *   - supabase.rpc(fn, params)
 *   - supabase.storage.from(bucket).*
 */
import { cookies } from 'next/headers';
import { getRedisClient } from '@/lib/redis';
import { getPgQueryBuilderFactory } from './query-builder';
import { getStorageProvider } from '@/lib/storage/provider';
import { withUserContext } from './pg';

const SESSION_COOKIE = 'liravo-session';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

interface DoUser {
  id: string;
  email: string;
}

function buildAuthModule(readCookie: () => string | undefined) {
  return {
    async getUser(): Promise<{ data: { user: DoUser | null }; error: null }> {
      const token = readCookie();
      if (!token) return { data: { user: null }, error: null };

      const redis = getRedisClient();
      const raw = await redis.get(`do:session:${token}`);
      if (!raw) return { data: { user: null }, error: null };

      try {
        return { data: { user: JSON.parse(raw) as DoUser }, error: null };
      } catch {
        return { data: { user: null }, error: null };
      }
    },

    async signOut(): Promise<void> {
      const token = readCookie();
      if (!token) return;
      const redis = getRedisClient();
      await redis.del(`do:session:${token}`);
      // Cookie clearing must be done in the route handler that has access to the response.
      // Routes should call cookies().delete(SESSION_COOKIE) after signOut().
    },

    // Not supported in DO mode — used only by middleware
    async exchangeCodeForSession() {
      return { error: new Error('OAuth not supported in DO mode') };
    },
  };
}

function buildStorageModule() {
  return {
    from(bucket: string) {
      const adapter = getStorageProvider();
      return {
        async upload(
          path: string,
          body: Buffer | Blob,
          opts?: { upsert?: boolean; contentType?: string }
        ) {
          const buf = body instanceof Buffer ? body : Buffer.from(await (body as Blob).arrayBuffer());
          return adapter.upload(bucket, path, buf, opts);
        },
        async remove(paths: string[]) {
          return adapter.remove(bucket, paths);
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: adapter.getPublicUrl(bucket, path) } };
        },
      };
    },
  };
}

function buildFromModule() {
  const factory = getPgQueryBuilderFactory();
  return (table: string) => factory.from(table);
}

function buildRpcModule() {
  const factory = getPgQueryBuilderFactory();
  return (fnName: string, params?: Record<string, unknown>) => factory.rpc(fnName, params);
}

// Used in API routes and server components — reads session from cookie store
export function createDoClient() {
  let _token: string | undefined;
  const readCookie = () => {
    if (_token !== undefined) return _token;
    try {
      const cookieStore = cookies();
      _token = cookieStore.get(SESSION_COOKIE)?.value;
    } catch {
      _token = undefined;
    }
    return _token;
  };

  return {
    auth: buildAuthModule(readCookie),
    from: buildFromModule(),
    rpc: buildRpcModule(),
    storage: buildStorageModule(),
  };
}

// Used by service-role operations — same as createDoClient but auth is bypassed
// by the route handler itself (it doesn't call getUser())
export function createDoServiceClient() {
  const readCookie = () => undefined; // Service client doesn't read user session
  return {
    auth: buildAuthModule(readCookie),
    from: buildFromModule(),
    rpc: buildRpcModule(),
    storage: buildStorageModule(),
  };
}

// Middleware-specific helper — reads cookie from the incoming NextRequest
export async function getDoUserFromRequest(
  getCookieFn: (name: string) => string | undefined
): Promise<DoUser | null> {
  const token = getCookieFn(SESSION_COOKIE);
  if (!token) return null;

  const redis = getRedisClient();
  const raw = await redis.get(`do:session:${token}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DoUser;
  } catch {
    return null;
  }
}

export async function createDoSession(user: DoUser): Promise<string> {
  const token = crypto.randomUUID();
  const redis = getRedisClient();
  await redis.set(`do:session:${token}`, JSON.stringify(user), { ex: SESSION_TTL });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`do:session:${token}`);
}

export { SESSION_COOKIE, SESSION_TTL };

/**
 * Re-exported for DO/Railway routes that want to group DB operations under a
 * user-scoped transaction.  Usage:
 *
 *   import { withUserContext } from '@/lib/db/unified-client';
 *
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) return unauthorized();
 *
 *   const result = await withUserContext(user.id, async () => {
 *     const { data } = await supabase.from('shelves').select('*').eq('user_id', user.id);
 *     return data;
 *   });
 *
 * All PgQueryBuilder calls inside the callback automatically run in the same
 * transaction with app.current_user_id set, providing an audit trail and a
 * foundation for future database-level RLS enforcement without changes to
 * individual queries.
 */
export { withUserContext };
