/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  reactStrictMode: true,
  
  // Production optimizations
  swcMinify: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },
  
  // Experimental optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  
  // Webpack optimizations
  webpack: (config, { isServer }) => {
    // Tree shaking improvements
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false,
    };
    
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
