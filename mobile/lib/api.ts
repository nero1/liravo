import { API_BASE } from '@/constants/api';
import { useAuthStore } from '@/stores/auth';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiResponse<T = unknown> {
  data: T;
  ok: boolean;
}

const pendingIntents = new Map<string, string>();

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  method: Method = 'GET',
  body?: unknown,
  params?: Record<string, string | number | undefined>,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const { token, user } = useAuthStore.getState();
  const mutating = method !== 'GET';
  const primaryAuth=/^\/api\/(auth\/(login|signup|google|telegram|2fa\/verify)|users\/(account-recovery|verify-recovery|verify-email))$/.test(path);
  const secret=primaryAuth||!!body&&typeof body==='object'&&Object.keys(body).some(key=>/^(pin|currentPin|current_pin|newPin|password)$/i.test(key));
  const signature = secret?'':JSON.stringify([user?.id ?? token, method, path, body]);
  const trackIntent=mutating&&!secret;
  const suppliedKey = Object.entries(extraHeaders ?? {}).find(([name]) => /^(x-)?idempotency-key$/i.test(name))?.[1];
  let intentKey = suppliedKey ?? pendingIntents.get(signature);
  if (trackIntent && !intentKey) {
    intentKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    pendingIntents.set(signature, intentKey);
  }

  const headers: Record<string, string> = {
    'Content-Type':'application/json',
    'X-Liravo-Client':'native',
    ...(intentKey ? { 'Idempotency-Key': intentKey!, 'X-Idempotency-Key': intentKey! } : {}),
    ...Object.fromEntries(Object.entries(extraHeaders ?? {}).filter(([name]) => !/^(x-)?idempotency-key$/i.test(name))),
  };
  if (token&&!primaryAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
  const res = await fetch(url, {
    method,
    credentials:'omit',
    signal:controller.signal,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      message = typeof json.error === 'string' ? json.error : message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  const data = res.status===204?undefined as T:await res.json() as T;
  if (trackIntent && !suppliedKey) pendingIntents.delete(signature);
  return data;
  }finally{clearTimeout(timeout);}
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    request<T>(path, 'GET', undefined, params),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, 'POST', body, undefined, headers),
  put: <T>(path: string, body?: unknown,headers?:Record<string,string>) => request<T>(path, 'PUT', body,undefined,headers),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
};

export { ApiError };
export type { ApiResponse };
