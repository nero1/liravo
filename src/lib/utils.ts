import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LEVEL_THRESHOLDS } from '@/constants/config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLevelInfo(xp: number) {
  const level = LEVEL_THRESHOLDS.find((l) => xp >= l.min && xp <= l.max);
  return level ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function generateReferralCode(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  const numeric = BigInt('0x' + uuid.slice(0, 14)).toString();
  return numeric.slice(0, 12).padStart(12, '0');
}

export function getClientIp(request: Request): string {
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!header) return 'unknown';
  const value = request.headers.get(header)?.trim();
  return value && /^[a-fA-F0-9.:]{3,64}$/.test(value) ? value : 'unknown';
}

export function getRequestCorrelationId(request: Request): string {
  // Bugfix: always propagate a correlation ID for financial/security observability.
  const supplied = request.headers.get('x-request-id');
  return supplied && /^[a-zA-Z0-9_-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
}

/** Normalizes a many-to-one relation across PostgREST and direct PostgreSQL adapters. */
export function singleRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
