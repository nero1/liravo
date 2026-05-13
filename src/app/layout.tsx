import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import { getDirection } from '@/lib/rtl';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Liravo — Book Discovery Social Network', template: '%s | Liravo' },
  description: 'Discover books through people whose taste you trust. Track reading, write reviews, and connect with readers worldwide.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Liravo' },
  keywords: ['books', 'reading', 'book reviews', 'book discovery', 'social reading'],
  authors: [{ name: 'Liravo' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://liravo.org',
    siteName: 'Liravo',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

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
          <ThemeProvider>
            <ServiceWorkerRegister />
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
