/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    turbopack: true,
  },
};

module.exports = nextConfig;
