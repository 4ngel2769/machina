import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  turbopack: {},
  // Reduce aggressive HMR recompilation in development
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

export default nextConfig;
