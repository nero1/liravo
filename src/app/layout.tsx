import type { Metadata, Viewport } from 'next';
import {headers} from 'next/headers';
import { APP_URL } from '@/constants/config';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages,getTranslations } from 'next-intl/server';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import { getDirection } from '@/lib/rtl';
import './globals.css';

export const dynamic='force-dynamic';

const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-body',
  display: 'swap',
});

const playfair = localFont({
  src: '../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2',
  weight: '400 900',
  variable: '--font-display',
  display: 'swap',
});

export async function generateMetadata():Promise<Metadata>{
  const t=await getTranslations('site'),locale=await getLocale();
  return {
  metadataBase: new URL(APP_URL),
  title: { default:t('title'), template: '%s | Liravo' },
  description:t('description'),
  manifest:'/manifest.json?locale='+locale,
  icons:{icon:'/icons/icon-192.png'},
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Liravo' },
  keywords:t('keywords').split(','),
  authors: [{ name: 'Liravo' }],
  openGraph: {
    type: 'website',
    locale:({en:'en_US',fr:'fr_FR',de:'de_DE'}as Record<string,string>)[locale]??'en_US',
    url: APP_URL,
    siteName:'Liravo',
    images:[{url:'/opengraph-image?locale='+locale,width:1200,height:630,alt:t('socialTagline')}],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f0f' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={getDirection(locale)} suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider nonce={headers().get('x-nonce')??undefined}>
            <ServiceWorkerRegister />
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
