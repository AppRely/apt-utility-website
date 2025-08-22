/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    turbopack: true,
  },
  // Disable canvas module to run on server 
  webpack: (config) => {
    config.resolve.alias.canvas = false; 
    return config;
  },
};

module.exports = nextConfig;
