import Link from "next/link";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import { C, FONT } from "@/lib/theme";



export default async function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: C.paper, fontFamily: FONT.body }}>

      <SiteHeader />

      <main className="flex-1">{children}</main>

      <footer className="border-t" style={{ borderColor: C.line, backgroundColor: C.paper }}>
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs" style={{ color: C.muted }}>
          <div>© {new Date().getFullYear()} SeatMe. Plan seating for any event.</div>
          <div className="flex items-center gap-5">
            <Link href="/about" style={{ color: C.muted, textDecoration: "none" }}>
              About
            </Link>
            <Link href="/contact" style={{ color: C.muted, textDecoration: "none" }}>
              Contact
            </Link>
            <Link href="/privacy" style={{ color: C.muted, textDecoration: "none" }}>
              Privacy
            </Link>
            <Link href="/terms" style={{ color: C.muted, textDecoration: "none" }}>
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
