import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import PwaSupport from "@/components/PwaSupport";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  themeColor: "#F7F3EA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaSupport />
        <Analytics />
      </body>
    </html>
  );
}
