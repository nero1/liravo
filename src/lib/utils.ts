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
  // Bugfix: do not trust arbitrary x-forwarded-for chain; prefer platform-provided client IP first.
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (
    forwarded &&
    !forwarded.startsWith('10.') &&
    !forwarded.startsWith('192.168.') &&
    !forwarded.startsWith('172.16.')
  ) return forwarded;
  return 'unknown';
}

export function getRequestCorrelationId(request: Request): string {
  // Bugfix: always propagate a correlation ID for financial/security observability.
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}
