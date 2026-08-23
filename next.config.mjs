/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // bullmq optionally supports @valkey/valkey-glide as an alternate Redis
    // client; we use ioredis (see lib/queue/connection.ts) and never import
    // the valkey path, so this is dead code as far as this project is
    // concerned — silence the otherwise-harmless "module not found" warning.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@valkey/valkey-glide": false,
    };
    return config;
  },
};

export default nextConfig;
