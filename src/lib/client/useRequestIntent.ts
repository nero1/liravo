'use client';

import { useRef } from 'react';

/** Retains one key across network retries; edited payloads and acknowledged successes start a new intent. */
export function useRequestIntent() {
  const current = useRef<{ payload: string; key: string } | null>(null);
  return {
    headers(payload: unknown) {
      const serialized = JSON.stringify(payload);
      if (current.current?.payload !== serialized) current.current = { payload: serialized, key: crypto.randomUUID() };
      return { 'Idempotency-Key': current.current.key };
    },
    complete() { current.current = null; },
  };
}
