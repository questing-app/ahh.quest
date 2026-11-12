/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@quest/sdk'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'arweave.net',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
  },
  // GoDaddy's parking page sent visitors to /lander, so browsers that saw the domain
  // before it pointed here still autocomplete to it.
  async redirects() {
    return [{ source: '/lander', destination: '/', permanent: true }]
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}

module.exports = nextConfig
