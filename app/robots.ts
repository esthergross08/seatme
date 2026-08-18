import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/events", "/api", "/auth"],
    },
    sitemap: "https://www.seatmeapp.com/sitemap.xml",
  };
}
