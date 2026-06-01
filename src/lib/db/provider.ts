export type DatabaseProvider = 'supabase' | 'digitalocean' | 'railway';

// Providers that connect directly to PostgreSQL (not via Supabase).
// To add a new provider: add it to DatabaseProvider above and to this list.
const DIRECT_POSTGRES_PROVIDERS: readonly DatabaseProvider[] = ['digitalocean', 'railway'];

export function getProvider(): DatabaseProvider {
  const p = process.env.DATABASE_PROVIDER ?? 'supabase';
  const valid: readonly string[] = ['supabase', ...DIRECT_POSTGRES_PROVIDERS];
  if (!valid.includes(p)) {
    throw new Error(`Invalid DATABASE_PROVIDER: "${p}". Must be one of: ${valid.join(', ')}`);
  }
  return p as DatabaseProvider;
}

// True for any direct-PostgreSQL provider (digitalocean, railway, or any future addition).
export function isDirectPostgres(): boolean {
  return (DIRECT_POSTGRES_PROVIDERS as readonly string[]).includes(getProvider());
}

export function isDigitalOcean(): boolean {
  return getProvider() === 'digitalocean';
}

export function isRailway(): boolean {
  return getProvider() === 'railway';
}
