import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LocationsList from "./LocationsList";
import { C, FONT } from "@/lib/theme";

// Same reasoning as app/events/page.tsx: this page is mutated a lot from the client
// (add/edit/delete a location), so always fetch fresh rather than risk a stale
// client-side-cached render after navigating away and back.
export const dynamic = "force-dynamic";


export default async function LocationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: locations }, { data: events }] = await Promise.all([
    supabase.from("locations").select("*").eq("owner_id", user.id).order("name"),
    supabase
      .from("events")
      .select("id, name, location, event_date")
      .eq("owner_id", user.id)
      .not("location", "is", null),
  ]);

  return (
    <div
      className="min-h-screen w-full px-6 py-10 sm:py-14"
      style={{ backgroundColor: C.paper, fontFamily: FONT.body }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div
            className="text-[11px] tracking-[0.18em] uppercase font-semibold mb-1"
            style={{ color: C.gold }}
          >
            Seating Planner
          </div>
          <h1 className="text-3xl" style={{ fontFamily: FONT.display, color: C.ink }}>
            My locations
          </h1>
          <p className="text-xs mt-1" style={{ color: C.muted }}>
            Save a venue&apos;s capacity and usual table setup once, then reuse it every time you create an event there.
          </p>
        </div>

        <LocationsList locations={locations ?? []} events={events ?? []} ownerId={user.id} />
      </div>
    </div>
  );
}
