import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon.svg" }];
  },
};

export default nextConfig;
