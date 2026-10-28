import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the LAN load dev assets (Next blocks non-localhost origins
  // in dev by default, which leaves the page un-hydrated). Dev-only setting.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  // Turbopack's on-disk cache kept serving the old globals.css after edits
  // made while the server was stopped (the Tailwind loader result was
  // restored as-is). Correct CSS beats a faster cold start (D37).
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
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
