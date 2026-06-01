/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000', 'neuronest.vercel.app'] } },
}
module.exports = nextConfig
