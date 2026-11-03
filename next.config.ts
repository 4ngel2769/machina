import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  // Server code runs under tsx server.ts; the next build only needs the client+SSR bundles.
  outputFileTracingIncludes: {
    '/**': ['./lib/core/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // never allow the control plane to be framed or sniffed
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(),' },
          {
            // terminal/VNC speak ws(s) to self; inline styles because the UI
            // uses style= attributes; unsafe-inline for Next hydration scripts
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
