import { redirect } from "next/navigation";
import Link from "next/link";
import { Wand2, LayoutGrid, Users, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  line: "#E4DCC9",
  muted: "#736D5F",
};

const FEATURES = [
  {
    icon: Wand2,
    title: "Auto-generate seating",
    body: "Set your rules — who must sit together, who can't — and let SeatMe find a plan that works, in seconds.",
  },
  {
    icon: LayoutGrid,
    title: "A real floor plan",
    body: "Drag tables into place, pick round, oval, square, or rectangle, and see exactly how the room will look.",
  },
  {
    icon: Users,
    title: "Guests & RSVPs, organized",
    body: "Import your list from a spreadsheet, tag groups, and see at a glance who's seated and who isn't.",
  },
  {
    icon: Sparkles,
    title: "Decor inspiration",
    body: "Connect a Pinterest board and get table decor suggestions grounded in what you've actually pinned.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/home");

  return (
    <div>
      <section
        className="relative flex items-center justify-center text-center px-6 min-h-[560px] sm:min-h-[680px]"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(34,31,43,0.72), rgba(34,31,43,0.55) 45%, rgba(34,31,43,0.82)), url('https://images.unsplash.com/photo-1758810743028-6b8e150ec98f?w=2400&q=80&auto=format&fit=crop')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="max-w-2xl py-16">
          <div className="text-xs tracking-[0.3em] uppercase font-semibold mb-5" style={{ color: C.goldSoft }}>
            Seating, sorted
          </div>
          <h1
            className="text-5xl sm:text-7xl leading-tight mb-5"
            style={{ fontFamily: "Fraunces, serif", color: "#fff" }}
          >
            Seat Me
          </h1>
          <p className="text-base sm:text-lg max-w-xl mx-auto mb-9" style={{ color: "#EDE7D8" }}>
            A seating planner for any event — weddings, dinners, galas, reunions. Set your guest list and a few
            rules, and get a seating chart you can trust, with a floor plan you can actually see.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
            <Link
              href="/login"
              className="inline-flex items-center text-sm font-semibold px-6 py-3 rounded-lg"
              style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center text-sm font-semibold px-6 py-3 rounded-lg border"
              style={{ borderColor: "rgba(255,255,255,0.5)", color: "#fff", textDecoration: "none" }}
            >
              Log in
            </Link>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium" style={{ color: "#EDE7D8" }}>
            <Link href="/about" style={{ color: "#EDE7D8", textDecoration: "none" }}>
              About
            </Link>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <Link href="/contact" style={{ color: "#EDE7D8", textDecoration: "none" }}>
              Contact
            </Link>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <Link href="/privacy" style={{ color: "#EDE7D8", textDecoration: "none" }}>
              Privacy
            </Link>
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <Link href="/terms" style={{ color: "#EDE7D8", textDecoration: "none" }}>
              Terms
            </Link>
          </nav>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="p-5 rounded-xl border" style={{ borderColor: C.line, backgroundColor: C.card }}>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: C.goldSoft, color: C.gold }}
                >
                  <Icon size={18} />
                </div>
                <h3 className="text-base font-semibold mb-1" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24 text-center">
        <div className="p-10 rounded-2xl" style={{ backgroundColor: C.goldSoft }}>
          <h2 className="text-2xl mb-2" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
            Ready to stop wrestling with sticky notes?
          </h2>
          <p className="text-sm mb-6" style={{ color: C.ink }}>
            It's free to get started — no credit card needed.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center text-sm font-semibold px-6 py-3 rounded-lg"
            style={{ backgroundColor: C.ink, color: "#fff", textDecoration: "none" }}
          >
            Create your first event
          </Link>
        </div>
      </section>
    </div>
  );
}
