const isDev = process.env.NODE_ENV !== 'production';

// Dev needs unsafe-eval for React Refresh; production does not.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev` holds file handles on its output directory, so a concurrent
  // `next build` writing to the same place fails on Windows (EPERM on
  // .next/trace). NEXT_DIST_DIR lets a verification build use its own
  // directory — see `npm run build:isolated`. Deploys leave it unset.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  trailingSlash: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Mic (voice dictation) and geolocation (field check-in) stay
          // first-party; everything else is off.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(self), geolocation=(self), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
