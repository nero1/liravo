export const CSRF_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-liravo-csrf' : 'liravo-csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function validCsrf(cookie: string | undefined, token: string | null): boolean {
  return !!cookie && /^[a-f0-9-]{36}$/.test(cookie) && cookie === token;
}

export function sameOrigin(value: string | null, origin: string): boolean {
  if (!value) return false;
  try { return new URL(value).origin === origin; } catch { return false; }
}
