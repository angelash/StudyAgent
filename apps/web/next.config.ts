import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@study-agent/contracts', '@study-agent/config', '@study-agent/ui'],
};

export default nextConfig;
