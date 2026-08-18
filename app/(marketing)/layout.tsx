import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#8A8272",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
`;

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: C.paper, fontFamily: "Inter, sans-serif" }}>
      <style>{FONTS}</style>

      <header className="border-b" style={{ borderColor: C.line, backgroundColor: C.paper }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl" style={{ fontFamily: "Fraunces, serif", color: C.ink, textDecoration: "none" }}>
            SeatMe
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium" style={{ color: C.ink }}>
            <Link href="/about" style={{ color: C.ink, textDecoration: "none" }}>
              About
            </Link>
            <Link href="/contact" style={{ color: C.ink, textDecoration: "none" }}>
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/events"
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
              >
                My events
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline text-sm font-medium" style={{ color: C.ink, textDecoration: "none" }}>
                  Log in
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-semibold px-4 py-2 rounded-lg"
                  style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

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
