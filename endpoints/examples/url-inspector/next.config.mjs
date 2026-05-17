import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: here,
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
