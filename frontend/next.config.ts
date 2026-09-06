import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['lucide-react', 'framer-motion'] },

  webpack(config, { dev }) {
    if (dev) {
      // Prevents ENOENT errors when .next cache doesn't exist yet on fresh start
      config.cache = false;
    }
    return config;
  },

  async rewrites() {
    // BACKEND_URL is server-side only — never exposed to browser
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      { source: '/api/:path*', destination: `${backendUrl}/:path*` },
    ];
  },
};

export default nextConfig;
