'use client';

import { useRef } from 'react';

/** Retains one key across network retries; edited payloads and acknowledged successes start a new intent. */
export function useRequestIntent() {
  const current = useRef(new Map<string,{ payload: string; key: string }>());
  return {
    headers(payload: unknown, scope = 'default') {
      const serialized = JSON.stringify(payload);
      if (current.current.get(scope)?.payload !== serialized) current.current.set(scope,{ payload: serialized, key: crypto.randomUUID() });
      return { 'Idempotency-Key': current.current.get(scope)!.key };
    },
    complete(scope = 'default') { current.current.delete(scope); },
  };
}
