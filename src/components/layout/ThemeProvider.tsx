'use client';

import '@/lib/client/csrf';

import {useEffect,useState} from 'react';
import {normalizeThemeCss} from '@/lib/theme-css';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children,nonce }: { children: React.ReactNode;nonce?:string }) {
  const [css,setCss]=useState('');
  useEffect(()=>{
    let controller:AbortController|undefined;
    const load=async()=>{
      controller?.abort();const active=new AbortController();controller=active;const timer=setTimeout(()=>active.abort(),4000);
      try{const response=await fetch('/api/theme',{cache:'no-store',signal:active.signal});if(!response.ok)return;const data=await response.json();if(typeof data.css==='string'&&!active.signal.aborted)setCss(normalizeThemeCss(data.css));}catch{}finally{clearTimeout(timer);}
    };
    void load();window.addEventListener('liravo:theme-changed',load);
    return()=>{controller?.abort();window.removeEventListener('liravo:theme-changed',load);};
  },[]);
  return (
    <NextThemesProvider nonce={nonce} attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {css&&<style data-liravo-theme>{css}</style>}
      {children}
    </NextThemesProvider>
  );
}
