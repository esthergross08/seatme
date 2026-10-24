import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import PwaSupport from "@/components/PwaSupport";
import { Fraunces, Inter, Playfair_Display } from "next/font/google";
import { C } from "@/lib/theme";
import "./globals.css";

// Self-hosted brand fonts (see lib/theme.ts). Each exposes a CSS variable used
// by FONT, the Tailwind theme and the poster export.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  style: ["normal", "italic"],
});

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
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <PwaSupport />
        <Analytics />
      </body>
    </html>
  );
}
