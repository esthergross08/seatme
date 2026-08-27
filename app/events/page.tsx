import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewEventButton from "./NewEventButton";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  line: "#E4DCC9",
  muted: "#8A8272",
};

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div
      className="min-h-screen w-full px-6 py-10 sm:py-14"
      style={{ backgroundColor: C.paper, fontFamily: "Inter, sans-serif" }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div
              className="text-[11px] tracking-[0.18em] uppercase font-semibold mb-1"
              style={{ color: C.gold }}
            >
              Seating Planner
            </div>
            <h1 className="text-3xl" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
              My events
            </h1>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              {user.email}
            </p>
          </div>
          <NewEventButton ownerId={user.id} />
        </div>

        <div className="flex flex-col gap-3">
          {(events ?? []).length === 0 && (
            <div className="p-6 rounded-xl border text-center" style={{ borderColor: C.line, backgroundColor: C.card }}>
              <p className="text-sm" style={{ color: C.muted }}>
                No events yet — create your first one above.
              </p>
            </div>
          )}
          {(events ?? []).map((ev) => (
            <Link
              key={ev.id}
              href={`/events/${ev.id}`}
              className="block p-5 rounded-xl border transition-colors"
              style={{ borderColor: C.line, backgroundColor: C.card, textDecoration: "none", color: C.ink }}
            >
              <div className="flex flex-wrap items-center gap-2 text-base font-medium" style={{ fontFamily: "Fraunces, serif" }}>
                {ev.name || "Untitled event"}
                {ev.owner_id !== user.id && (
                  <span
                    className="text-[11px] font-medium rounded-full px-2 py-0.5"
                    style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "Inter, sans-serif" }}
                  >
                    shared with you
                  </span>
                )}
              </div>
              <div className="text-xs mt-1" style={{ color: C.muted }}>
                Updated {new Date(ev.updated_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
