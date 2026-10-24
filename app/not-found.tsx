import Link from "next/link";
import { C, FONT } from "@/lib/theme";


export default function NotFound() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center text-center px-6"
      style={{ backgroundColor: C.paper, fontFamily: FONT.body }}
    >
      <div>
        <div className="text-xs tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: C.gold }}>
          404
        </div>
        <h1 className="text-3xl mb-3" style={{ fontFamily: FONT.display, color: C.ink }}>
          Couldn&apos;t find that page
        </h1>
        <p className="text-sm mb-8" style={{ color: C.muted }}>
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold px-5 py-3 rounded-lg"
          style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
        >
          Back to SeatMe
        </Link>
      </div>
    </div>
  );
}
