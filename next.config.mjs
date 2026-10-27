import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const provider = process.env.DATABASE_PROVIDER ?? 'supabase';
const isDirectPostgres = provider !== 'supabase';

const s3CdnHostname = process.env.S3_CDN_URL
  ? (() => { try { return new URL(process.env.S3_CDN_URL).hostname; } catch { return null; } })()
  : null;

const supabaseConnectSrc = isDirectPostgres
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
  ...(isDirectPostgres
    ? s3CdnHostname ? [{ protocol: 'https', hostname: s3CdnHostname }] : []
    : [{ protocol: 'https', hostname: '*.supabase.co' }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    if (isServer) config.resolve.alias['@huggingface/transformers'] = false;
    // ONNX emits pre-minified ES module workers; Next 14's script minifier cannot parse import.meta.
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.compilation.tap('OnnxModuleWorkers', compilation => {
          compilation.hooks.processAssets.tap({
            name: 'OnnxModuleWorkers',
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE - 1,
          }, assets => {
            for (const name of Object.keys(assets)) {
              if (/^static\/media\/ort\..*\.mjs$/.test(name)) {
                compilation.updateAsset(name, assets[name], { minimized: true });
              }
            }
          });
        });
      },
    });
    return config;
  },
  images: {
    remotePatterns,
    formats: ['image/webp'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  experimental: {
    serverActions: { allowedOrigins: ['liravo.org', 'localhost:3000'] },
    optimizePackageImports: isDirectPostgres ? ['postgres'] : ['@supabase/supabase-js'],
  },
};

export default withNextIntl(nextConfig);
