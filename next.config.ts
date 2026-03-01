import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow images from LINE CDN & Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Required for LINE LIFF: disable X-Frame-Options restriction
  // LINE opens LIFF in a WebView (iframe-like environment)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow LINE to embed the app
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          // Required for camera & microphone in LIFF WebView
          {
            key: 'Permissions-Policy',
            value: 'camera=*, microphone=*, geolocation=()',
          },
        ],
      },
    ]
  },

}

export default nextConfig
