import type { NextConfig } from "next";

// Cache Components is switched off on purpose: this is a small internal app where
// every page depends on the logged-in user, so classic dynamic rendering is simpler
// and safer (no risk of caching one user's data for another).
const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: {
    // Lead imports send up to 5,000 rows to a Server Action.
    serverActions: { bodySizeLimit: "4mb" },
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
