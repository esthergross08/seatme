import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewEventButton from "./NewEventButton";
import EventsList from "./EventsList";

// Always fetch fresh from the database — this page is mutated a lot from the client
// (create, rename, delete), and the router's client-side cache showing a stale list
// after navigating away and back is exactly the kind of "changes don't stick" bug
// that's easy to mistake for a real data bug.
export const dynamic = "force-dynamic";

const C = {
  ink: "#2B2440",
  paper: "#F5F2FB",
  card: "#FFFFFF",
  gold: "#7454C9",
  goldSoft: "#E9E1FA",
  line: "#E3DEF2",
  muted: "#6B6580",
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

        <EventsList events={events ?? []} userId={user.id} />
      </div>
    </div>
  );
}
