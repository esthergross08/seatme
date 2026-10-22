import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Short, clean links for social bios and posts. Each forwards to the homepage
  // with UTM tags, which the visit tracker in lib/supabase/middleware.ts records,
  // so traffic from each place can be counted. Temporary (307) redirects, so
  // browsers don't cache them and the targets can be changed later.
  async redirects() {
    return [
      { source: "/ig", destination: "/?utm_source=instagram&utm_medium=bio", permanent: false },
      { source: "/story", destination: "/?utm_source=instagram&utm_medium=story", permanent: false },
      { source: "/tt", destination: "/?utm_source=tiktok&utm_medium=bio", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // Browsers must always re-check the service worker so app updates
        // reach installed users on their next visit.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
