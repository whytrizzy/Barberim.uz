import type { NextConfig } from 'next';

// Importing the env modules here makes `next build` fail fast on invalid configuration.
import './src/env/server';
import './src/env/client';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false,
};

export default nextConfig;
