'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(registration=>registration.active?.postMessage({type:'LIRAVO_CACHE_PUBLIC_SHELL'})).catch(()=>{});
    }
  }, []);

  return null;
}
