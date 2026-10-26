import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the LAN load dev assets (Next blocks non-localhost origins
  // in dev by default, which leaves the page un-hydrated). Dev-only setting.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
