import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['compress-pdf'],
  outputFileTracingIncludes: {
    '/api/compress': ['./bin/linux/gs'],
  },
};

export default nextConfig;
