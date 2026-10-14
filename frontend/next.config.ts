import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Backend origin. Rewrites are resolved at build time; Docker passes it as a build argument. */
const apiUrl = process.env.KURU_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Shown in Settings → About.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    // Same-origin API access: cookies work and no CORS is needed.
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
