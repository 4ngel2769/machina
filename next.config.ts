import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Turbopack configuration (required for Next.js 16)
  turbopack: {
    // Turbopack is enabled by default in Next.js 16
    // Most webpack customizations aren't needed with Turbopack's optimizations
  },
  
  // External packages for server components
  serverExternalPackages: ['ssh2', 'dockerode', 'node-libvirt'],
  
  // Experimental features
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  
  // Production optimizations
  reactStrictMode: true,
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },
  
  // Remove webpack config for production builds (use Turbopack)
  // Only use webpack in development for specific customizations
  ...(!process.env.TURBOPACK && {
    webpack: (config, { dev, isServer }) => {
      if (dev && !isServer) {
        // Reduce watchOptions polling to prevent constant recompiles
        config.watchOptions = {
          ...config.watchOptions,
          poll: undefined, // Disable polling
          ignored: /node_modules/,
        };
      }
      return config;
    },
  }),
  
  // Allow dev server access from local network
  allowedDevOrigins: [
    'http://192.168.1.200:3000',
    'ws://192.168.1.200:3000',
    'http://192.168.1.200',
    'ws://192.168.1.200'
  ],
  
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Requested-With, Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
