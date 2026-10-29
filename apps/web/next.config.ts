import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.STUDY_WEB_DIST_DIR || '.next',
  transpilePackages: ['@study-agent/contracts', '@study-agent/config', '@study-agent/ui'],
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: `http://127.0.0.1:${process.env.API_PORT || 4000}/api/:path*`,
    }];
  },
};

export default nextConfig;
