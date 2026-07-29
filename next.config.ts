import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['compress-pdf'],
  outputFileTracingIncludes: {
    '/api/compress': ['./node_modules/compress-pdf/bin/**/*'],
  },
};

export default nextConfig;
