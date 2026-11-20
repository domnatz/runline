import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const apiOrigin = process.env.RUNLINE_API_ORIGIN ?? "http://127.0.0.1:4000";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/track/:path*",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Cache-Control", value: "private, no-store" },
      ],
    }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
