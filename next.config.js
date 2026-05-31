/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000', 'neuronest.vercel.app'] } },
  async headers() {
    return [
      {
        source: '/api/images',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}
module.exports = nextConfig
