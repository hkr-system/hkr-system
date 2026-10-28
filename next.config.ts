import type { NextConfig } from "next";

// Cache Components is switched off on purpose: this is a small internal app where
// every page depends on the logged-in user, so classic dynamic rendering is simpler
// and safer (no risk of caching one user's data for another).
const nextConfig: NextConfig = {
  cacheComponents: false,
  // Excel and PDF generators run as plain Node.js modules (credit notes, RMA batch files).
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
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
