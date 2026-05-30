export type DatabaseProvider = 'supabase' | 'digitalocean';

export function getProvider(): DatabaseProvider {
  const p = process.env.DATABASE_PROVIDER ?? 'supabase';
  if (p !== 'supabase' && p !== 'digitalocean') {
    throw new Error(`Invalid DATABASE_PROVIDER: "${p}"`);
  }
  return p;
}

export function isDigitalOcean(): boolean {
  return getProvider() === 'digitalocean';
}
