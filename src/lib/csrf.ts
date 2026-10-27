export const CSRF_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-liravo-csrf' : 'liravo-csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function validCsrf(cookie: string | undefined, token: string | null): boolean {
  return !!cookie && /^[a-f0-9-]{36}$/.test(cookie) && cookie === token;
}

export function sameOrigin(value: string | null, origin: string): boolean {
  if (!value) return false;
  try { return new URL(value).origin === origin; } catch { return false; }
}

/** Uses the HTTP authority; forwarded host headers do not establish browser origin. */
export function getRequestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (!host) return url.origin;
    const authority = new URL(`${url.protocol}//${host}`);
    if (authority.username || authority.password || authority.pathname !== '/' || authority.search || authority.hash) return null;
    return authority.origin;
  } catch { return null; }
}

export function isStatelessNativeAuth(request:Request):boolean {
  return request.method==='POST'&&['/api/auth/login','/api/auth/signup','/api/auth/google','/api/auth/telegram','/api/auth/2fa/verify'].includes(new URL(request.url).pathname)
    &&request.headers.get('x-liravo-client')==='native'
    &&!['cookie','origin','sec-fetch-site','sec-fetch-mode'].some(header=>request.headers.has(header));
}
