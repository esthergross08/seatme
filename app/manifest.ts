import type { MetadataRoute } from "next";

// Web app manifest — this is what makes SeatMe installable to a phone's home
// screen ("Add to Home Screen" on iOS, "Install app" on Android/Chrome).
// Served by Next at /manifest.webmanifest and linked automatically in <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SeatMe — Seating charts for any event",
    short_name: "SeatMe",
    description:
      "Plan your event's seating chart: tables, guests, RSVPs and auto-generated seating.",
    // Signed-in users land straight on their events; signed-out users are sent
    // to /login by the middleware, which is the right first screen for the app.
    start_url: "/events",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F7F3EA",
    theme_color: "#F7F3EA",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
