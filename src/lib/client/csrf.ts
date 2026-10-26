import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

if (typeof window !== 'undefined') {
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (url.origin !== location.origin || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return original(input, init);
    const token = document.cookie.split('; ').find(c => c.startsWith(`${CSRF_COOKIE}=`))?.slice(CSRF_COOKIE.length + 1);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token) headers.set(CSRF_HEADER, token);
    return original(input, { ...init, headers });
  };
}
