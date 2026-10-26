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
  const signature = JSON.stringify([user?.id ?? token, method, path, body]);
  const mutating = method !== 'GET';
  const suppliedKey = Object.entries(extraHeaders ?? {}).find(([name]) => /^(x-)?idempotency-key$/i.test(name))?.[1];
  let intentKey = suppliedKey ?? pendingIntents.get(signature);
  if (mutating && !intentKey) {
    intentKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    pendingIntents.set(signature, intentKey);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(mutating ? { 'Idempotency-Key': intentKey!, 'X-Idempotency-Key': intentKey! } : {}),
    ...Object.fromEntries(Object.entries(extraHeaders ?? {}).filter(([name]) => !/^(x-)?idempotency-key$/i.test(name))),
  };
  if (token) {
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

  const res = await fetch(url, {
    method,
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

  const data = await res.json() as T;
  if (mutating && !suppliedKey) pendingIntents.delete(signature);
  return data;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    request<T>(path, 'GET', undefined, params),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, 'POST', body, undefined, headers),
  put: <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
};

export { ApiError };
export type { ApiResponse };
