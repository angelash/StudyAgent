import type { NextConfig } from 'next';

// Baseline browser protections for pages served by Next. API responses keep their own
// headers (nosniff, no-store, sandboxed file responses), so /api is excluded here.
// Same-origin framing stays allowed for in-app PDF and source previews; a full
// script CSP needs a nonce pass over MathJax/KaTeX/MathLive and is a follow-up.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000' },
];

const nextConfig: NextConfig = {
  distDir: process.env.STUDY_WEB_DIST_DIR || '.next',
  poweredByHeader: false,
  transpilePackages: ['@study-agent/contracts', '@study-agent/config', '@study-agent/ui'],
  async headers() {
    return [{ source: '/:path((?!api/).*)', headers: securityHeaders }];
  },
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: `http://127.0.0.1:${process.env.API_PORT || 4000}/api/:path*`,
    }];
  },
};

export default nextConfig;
