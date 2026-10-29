import type { NextConfig } from 'next';

// Importing the env modules here makes `next build` fail fast on invalid configuration.
import './src/env/server';
import './src/env/client';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false,
  // Dev only: lets `npm run dev:tunnel` (Cloudflare quick tunnel) load dev assets over HTTPS,
  // so the Mini App can be opened inside Telegram from a laptop. Ignored by production builds.
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
