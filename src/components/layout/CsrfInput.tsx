'use client';

import { useEffect, useState } from 'react';
import { CSRF_COOKIE } from '@/lib/csrf';

export function CsrfInput() {
  const [intent, setIntent] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => { setIntent(crypto.randomUUID()); setToken(document.cookie.split('; ').find(c => c.startsWith(`${CSRF_COOKIE}=`))?.slice(CSRF_COOKIE.length + 1) ?? ''); }, []);
  return <><input type="hidden" name="_csrf" value={token} /><input type="hidden" name="_idempotency" value={intent} /></>;
}
