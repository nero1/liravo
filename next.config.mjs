import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const isDoMode = process.env.DATABASE_PROVIDER === 'digitalocean';

const s3CdnHostname = process.env.S3_CDN_URL
  ? (() => { try { return new URL(process.env.S3_CDN_URL).hostname; } catch { return null; } })()
  : null;

const supabaseConnectSrc = isDoMode
  ? ''
  : ' https://*.supabase.co wss://*.supabase.co';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https: http:",
      "font-src 'self' data:",
      `connect-src 'self'${supabaseConnectSrc} https://books.googleapis.com https://openlibrary.org`,
      "frame-src 'self' https://oauth.telegram.org https://www.youtube.com",
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

const remotePatterns = [
  { protocol: 'https', hostname: 'books.google.com' },
  { protocol: 'https', hostname: 'covers.openlibrary.org' },
  { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
  ...(isDoMode
    ? s3CdnHostname ? [{ protocol: 'https', hostname: s3CdnHostname }] : []
    : [{ protocol: 'https', hostname: '*.supabase.co' }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns,
    formats: ['image/webp'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  experimental: {
    serverActions: { allowedOrigins: ['liravo.org', 'localhost:3000'] },
    optimizePackageImports: isDoMode ? ['postgres'] : ['@supabase/supabase-js'],
  },
};

export default withNextIntl(nextConfig);
