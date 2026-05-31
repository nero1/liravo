import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql(): ReturnType<typeof postgres> {
  if (_sql) return _sql;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=digitalocean');

  const sslEnabled = process.env.DATABASE_SSL !== 'false';

  _sql = postgres(url, {
    prepare: false, // Required: PgBouncer transaction mode does not support prepared statements
    max: parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10),
    idle_timeout: 20,
    max_lifetime: 1800,
    connect_timeout: 15,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });

  return _sql;
}
