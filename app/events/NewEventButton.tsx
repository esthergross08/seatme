"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#2B2440",
  card: "#FFFFFF",
  gold: "#7454C9",
  line: "#E3DEF2",
  muted: "#6B6580",
  wine: "#8C3B3B",
};

interface PastEvent {
  id: string;
  name: string | null;
  location: string | null;
  event_date: string | null;
  updated_at: string;
  max_capacity: number | null;
  data: { tableGroups?: unknown[]; tableNameOverrides?: Record<string, string>; tablePositions?: Record<string, { x: number; y: number }> } | null;
}

interface SavedLocation {
  id: string;
  name: string;
  capacity: number | null;
  table_groups: unknown[];
  floor_plan_path: string | null;
  floor_plan_name: string | null;
}

function formatEventDate(dateStr: string) {
  // Parse as a plain calendar date (no timezone shift) — same approach as EventsList.tsx.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function NewEventButton({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");

  // Past locations you've used, fetched fresh each time the modal opens — this is what
  // powers both the location autocomplete and the "you've been here before, want to
  // reuse the table setup?" offer below. Saved locations (from the My locations page)
  // are a curated, intentional source and take priority; a past event at the same
  // location is the fallback for venues you haven't saved a location profile for yet.
  const [pastEvents, setPastEvents] = useState<PastEvent[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [copySetup, setCopySetup] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: eventsData }, { data: locationsData }] = await Promise.all([
        supabase
          .from("events")
          .select("id, name, location, event_date, updated_at, max_capacity, data")
          .eq("owner_id", ownerId)
          .not("location", "is", null)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("locations")
          .select("id, name, capacity, table_groups, floor_plan_path, floor_plan_name")
          .eq("owner_id", ownerId),
      ]);
      if (!cancelled) {
        setPastEvents((eventsData as PastEvent[]) ?? []);
        setSavedLocations((locationsData as SavedLocation[]) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownerId]);

  const knownLocations = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    [...savedLocations.map((l) => l.name), ...pastEvents.map((ev) => ev.location || "")].forEach((loc) => {
      const trimmed = loc.trim();
      if (trimmed && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        list.push(trimmed);
      }
    });
    return list;
  }, [savedLocations, pastEvents]);

  // A saved location profile (from My locations) is the curated, intentional source and
  // wins if one matches. Otherwise fall back to the most recent past event at this exact
  // location that actually has a table setup worth offering (skip empty/never-built-out
  // events).
  const matchedLocation = useMemo(() => {
    const trimmed = location.trim().toLowerCase();
    if (!trimmed) return null;
    return savedLocations.find((l) => l.name.trim().toLowerCase() === trimmed) ?? null;
  }, [location, savedLocations]);

  const matchedEvent = useMemo(() => {
    const trimmed = location.trim().toLowerCase();
    if (!trimmed || matchedLocation) return null;
    return (
      pastEvents.find(
        (ev) => ev.location?.trim().toLowerCase() === trimmed && (ev.data?.tableGroups?.length ?? 0) > 0
      ) ?? null
    );
  }, [location, pastEvents, matchedLocation]);

  useEffect(() => {
    if (!matchedLocation && !matchedEvent) setCopySetup(false);
  }, [matchedLocation, matchedEvent]);

  function openModal() {
    setName("");
    setEventDate("");
    setLocation("");
    setMaxCapacity("");
    setCopySetup(false);
    setError(null);
    setOpen(true);
  }

  function toggleCopySetup() {
    setCopySetup((prev) => {
      const next = !prev;
      const fallbackCapacity = matchedLocation ? matchedLocation.capacity : matchedEvent?.max_capacity ?? null;
      if (next && maxCapacity === "" && fallbackCapacity != null) {
        setMaxCapacity(String(fallbackCapacity));
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const seedData = !copySetup
      ? {}
      : matchedLocation
      ? { tableGroups: matchedLocation.table_groups ?? [] }
      : matchedEvent
      ? {
          tableGroups: matchedEvent.data?.tableGroups ?? [],
          tableNameOverrides: matchedEvent.data?.tableNameOverrides ?? {},
          tablePositions: matchedEvent.data?.tablePositions ?? {},
        }
      : {};
    const { data, error } = await supabase
      .from("events")
      .insert({
        name: name.trim() || "Untitled event",
        owner_id: ownerId,
        event_date: eventDate || null,
        location: location.trim() || null,
        max_capacity: maxCapacity === "" ? null : Number(maxCapacity),
        data: seedData,
      })
      .select()
      .single();
    if (error || !data) {
      setLoading(false);
      setError(error?.message || "Couldn't create the event.");
      return;
    }

    // Copy (not reference) the location's floor plan into this event's own storage
    // folder — sharing the exact same file would mean removing it from one place
    // deletes it from the other, which isn't what "reuse" should mean here. Best
    // effort: if this fails, the event still exists, just without the floor plan
    // pre-attached, and it can be uploaded manually from the Tables tab.
    if (copySetup && matchedLocation?.floor_plan_path) {
      const ext = matchedLocation.floor_plan_path.split(".").pop() || "bin";
      const destPath = `events/${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error: copyError } = await supabase.storage
        .from("floor-plans")
        .copy(matchedLocation.floor_plan_path, destPath);
      if (!copyError) {
        await supabase
          .from("events")
          .update({ data: { ...seedData, floorPlan: { path: destPath, name: matchedLocation.floor_plan_name || "Floor plan" } } })
          .eq("id", data.id);
      }
    }

    router.push(`/events/${data.id}`);
  }

  return (
    <>
      <button
        onClick={openModal}
        className="text-sm font-semibold px-4 py-2.5 rounded-lg self-start sm:self-auto shrink-0"
        style={{ border: "none", backgroundColor: C.gold, color: "#fff", cursor: "pointer" }}
      >
        + New event
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(34,31,43,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-event-title"
            className="w-full rounded-2xl p-6 sm:p-7"
            style={{ maxWidth: 440, backgroundColor: C.card }}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 id="new-event-title" className="text-2xl" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
                New event
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1 rounded hover:bg-black/5"
                style={{ color: C.muted }}
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs mb-5" style={{ color: C.muted }}>
              You can change any of this later.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: C.ink }}>
                  Event name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya & Sam's Wedding"
                  autoFocus
                  className="px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: C.ink }}>
                    Date
                  </span>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: C.line, color: C.ink }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: C.ink }}>
                    Max capacity
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(e.target.value)}
                    placeholder="Optional"
                    className="px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: C.line, color: C.ink }}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: C.ink }}>
                  Location
                </span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Venue, city, or address"
                  list="new-event-known-locations"
                  className="px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
                {knownLocations.length > 0 && (
                  <datalist id="new-event-known-locations">
                    {knownLocations.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                )}
              </label>

              {(matchedLocation || matchedEvent) && (
                <div
                  className="flex items-start justify-between gap-3 p-3 rounded-lg text-xs"
                  style={{ backgroundColor: "#FBF3E4", color: C.ink }}
                >
                  <span>
                    {matchedLocation ? (
                      <>
                        You&apos;ve saved a location profile for <strong>{matchedLocation.name}</strong>.
                      </>
                    ) : (
                      <>
                        You&apos;ve used this location before, for <strong>{matchedEvent!.name || "an earlier event"}</strong>
                        {matchedEvent!.event_date ? ` (${formatEventDate(matchedEvent!.event_date)})` : ""}.
                      </>
                    )}{" "}
                    {copySetup ? "Its table setup and capacity will carry over." : "Reuse its table setup and capacity?"}
                  </span>
                  <button
                    type="button"
                    onClick={toggleCopySetup}
                    className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg"
                    style={{
                      backgroundColor: copySetup ? C.gold : "transparent",
                      color: copySetup ? "#fff" : C.gold,
                      border: `1px solid ${C.gold}`,
                    }}
                  >
                    {copySetup ? "Will copy ✓" : "Copy setup"}
                  </button>
                </div>
              )}

              {error && (
                <p className="text-xs" style={{ color: C.wine }}>
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium px-3 py-2 rounded-lg"
                  style={{ color: C.muted }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
                  style={{ backgroundColor: C.gold, color: "#fff" }}
                >
                  {loading ? "Creating…" : "Create event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
