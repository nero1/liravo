import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';

type SqlInstance = ReturnType<typeof postgres>;
// postgres.begin() callback receives a transaction-scoped sql; we widen to SqlInstance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxSql = any;

let _pool: SqlInstance | null = null;

// Stores the transaction-scoped sql during a withUserContext call so that
// PgQueryBuilder automatically uses it without callers needing to thread it through.
const txStorage = new AsyncLocalStorage<TxSql>();

function getPool(): SqlInstance {
  if (_pool) return _pool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required in direct PostgreSQL mode (digitalocean or railway)');

  const sslEnabled = process.env.DATABASE_SSL !== 'false';

  _pool = postgres(url, {
    prepare: false, // Required: PgBouncer transaction mode does not support prepared statements
    max: parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10),
    idle_timeout: 20,
    max_lifetime: 1800,
    connect_timeout: 15,
    ssl: sslEnabled ? { rejectUnauthorized: true } : false,
  });

  return _pool;
}

export function getSql(): SqlInstance {
  const tx = txStorage.getStore();
  if (tx) return tx as unknown as SqlInstance;
  return getPool();
}

/**
 * Runs `fn` inside a PostgreSQL transaction with `app.current_user_id` set to
 * `userId` for the duration.  All PgQueryBuilder calls within `fn` automatically
 * inherit this transaction, so existing query code requires no changes.
 *
 * DO/Railway mode note: this alone does not enforce RLS unless the connecting
 * role has BYPASSRLS revoked and policies check
 * `current_setting('app.current_user_id', true)::uuid`.  Its primary value today
 * is grouping related queries into one transaction and providing a hook for
 * future database-level enforcement.
 */
export async function withUserContext<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const pool = getPool();
  return await pool.begin(async (txSql: TxSql) => {
    await txSql`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return txStorage.run(txSql as unknown as TxSql, fn);
  }) as T;
}
