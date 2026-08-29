"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Trash2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  card: "#FFFFFF",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#736D5F",
};

interface EventRow {
  id: string;
  name: string | null;
  owner_id: string;
  updated_at: string;
  event_date?: string | null;
  location?: string | null;
  max_capacity?: number | null;
  // Fetched via `select("*")` upstream — carried through untyped so a full row
  // (including the `data` seating-plan blob) can be re-inserted verbatim on undo.
  [key: string]: unknown;
}

function formatEventDate(dateStr: string) {
  // Parse as a plain calendar date (no timezone shift) rather than via `new Date(dateStr)`,
  // which treats a bare "YYYY-MM-DD" as UTC midnight and can display a day early/late
  // depending on the viewer's timezone.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type SortBy = "recent" | "name";

export default function EventsList({ events, userId }: { events: EventRow[]; userId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = events.filter((ev) => !hiddenIds.has(ev.id));
    if (q) list = list.filter((ev) => (ev.name || "Untitled event").toLowerCase().includes(q));
    list = [...list];
    if (sortBy === "name") {
      list.sort((a, b) => (a.name || "Untitled event").localeCompare(b.name || "Untitled event"));
    } else {
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return list;
  }, [events, hiddenIds, search, sortBy]);

  // No confirmation dialog, per the usual pattern here — but the delete itself happens
  // right away rather than being deferred. An earlier version deferred the actual database
  // delete until the undo window expired, which turned out to be fragile: if you navigated
  // away (into an event and back) before the timer fired, the delete could get lost, or a
  // stale cached copy of this list could make it look like nothing happened either way.
  // Undo now works by re-inserting the exact row that was deleted (same id and all), which
  // is simple to reason about and doesn't depend on this component staying mounted.
  async function handleDelete(ev: EventRow) {
    setHiddenIds((prev) => new Set(prev).add(ev.id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase.from("events").delete().eq("id", ev.id);

    if (deleteError) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
      setError(`Couldn't delete "${ev.name || "Untitled event"}": ${deleteError.message}`);
      return;
    }

    router.refresh();
    setUndo({
      message: `Deleted "${ev.name || "Untitled event"}".`,
      restore: async () => {
        const { error: restoreError } = await supabase.from("events").insert(ev);
        if (restoreError) {
          setError(`Couldn't restore "${ev.name || "Untitled event"}": ${restoreError.message}`);
          return;
        }
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(ev.id);
          return next;
        });
        router.refresh();
      },
    });
    undoTimerRef.current = setTimeout(() => setUndo(null), 8000);
  }

  function performUndo() {
    if (!undo) return;
    undo.restore();
    setUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  return (
    <div>
      {events.length > 5 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border" style={{ borderColor: C.line, backgroundColor: C.card }}>
            <Search size={14} style={{ color: C.muted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              aria-label="Search events"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: C.ink }}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="Sort events"
            className="px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: C.line, color: C.ink, backgroundColor: C.card }}
          >
            <option value="recent">Most recently updated</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="p-6 rounded-xl border text-center" style={{ borderColor: C.line, backgroundColor: C.card }}>
            <p className="text-sm" style={{ color: C.muted }}>
              {search ? `No events match "${search}".` : "No events yet — create your first one above."}
            </p>
          </div>
        )}
        {visible.map((ev) => (
          <div key={ev.id} className="relative group">
            <Link
              href={`/events/${ev.id}`}
              className="block p-5 rounded-xl border transition-colors"
              style={{ borderColor: C.line, backgroundColor: C.card, textDecoration: "none", color: C.ink, paddingRight: ev.owner_id === userId ? 44 : undefined }}
            >
              <div className="flex flex-wrap items-center gap-2 text-base font-medium" style={{ fontFamily: "Fraunces, serif" }}>
                {ev.name || "Untitled event"}
                {ev.owner_id !== userId && (
                  <span
                    className="text-[11px] font-medium rounded-full px-2 py-0.5"
                    style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "Inter, sans-serif" }}
                  >
                    shared with you
                  </span>
                )}
              </div>
              {(ev.event_date || ev.location) && (
                <div className="text-xs mt-1" style={{ color: C.ink }}>
                  {[ev.event_date ? formatEventDate(ev.event_date) : null, ev.location || null].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="text-xs mt-1" style={{ color: C.muted }}>
                Updated {new Date(ev.updated_at).toLocaleDateString()}
              </div>
            </Link>
            {ev.owner_id === userId && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(ev);
                }}
                title="Delete event"
                aria-label={`Delete ${ev.name || "Untitled event"}`}
                className="absolute top-4 right-4 p-1.5 rounded-lg opacity-60 hover:opacity-100"
                style={{ color: C.muted }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {undo && (
        <div
          className="fixed z-40 left-1/2 -translate-x-1/2 bottom-6 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl shadow-lg"
          style={{ backgroundColor: C.ink, color: "#F7F3EA", maxWidth: 420 }}
        >
          <span className="text-sm">{undo.message}</span>
          <button onClick={performUndo} className="flex items-center gap-1.5 text-sm font-semibold shrink-0" style={{ color: "#E7D9B8" }}>
            <Undo2 size={14} /> Undo
          </button>
        </div>
      )}

      {error && !undo && (
        <div
          className="fixed z-40 left-1/2 -translate-x-1/2 bottom-6 px-4 py-2.5 rounded-xl shadow-lg text-sm"
          style={{ backgroundColor: "#F3E4E4", color: "#8C3B3B", maxWidth: 420 }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
