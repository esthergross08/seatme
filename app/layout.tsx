import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import PwaSupport from "@/components/PwaSupport";
import { C, GOOGLE_FONTS_HREF } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeatMe — Seating charts for any event",
  description:
    "Plan your event's seating chart with drag-and-drop tables, auto-generated seating, guest and RSVP tracking, and decor inspiration pulled from your Pinterest board.",
  applicationName: "SeatMe",
  // Home-screen app behaviour on iPhone/iPad (the manifest covers Android).
  appleWebApp: {
    capable: true,
    title: "SeatMe",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: C.paper,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Brand fonts, loaded once for every route — see lib/theme.ts for why by name. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <PwaSupport />
        <Analytics />
      </body>
    </html>
  );
}
