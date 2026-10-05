"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
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
  deleted_at?: string | null;
  // Fetched via `select("*")` upstream; `data` is read for the guest count shown
  // in the delete confirmation.
  [key: string]: unknown;
}

function guestCount(ev: EventRow) {
  const data = ev.data as { guests?: unknown[] } | null | undefined;
  return Array.isArray(data?.guests) ? data.guests.length : 0;
}

function formatEventDate(dateStr: string) {
  // Parse as a plain calendar date (no timezone shift) rather than via `new Date(dateStr)`,
  // which treats a bare "YYYY-MM-DD" as UTC midnight and can display a day early/late
  // depending on the viewer's timezone.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type SortBy = "recent" | "name";

export default function EventsList({
  events,
  deletedEvents,
  userId,
}: {
  events: EventRow[];
  deletedEvents: EventRow[];
  userId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EventRow | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
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

  // Deleting asks first, and is a soft delete: it sets deleted_at rather than removing
  // the row. A hard delete took the whole guest list with it (plus collaborators and
  // logs, which cascade), and an 8-second undo toast was the only way back — easy to
  // miss, and someone did lose an imported guest list that way. Deleted events now sit
  // in "Recently deleted" below the list, where the owner can restore them any time.
  async function handleDelete(ev: EventRow) {
    setConfirmDelete(null);
    setHiddenIds((prev) => new Set(prev).add(ev.id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo(null);

    const { data: deleted, error: deleteError } = await createClient()
      .from("events")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ev.id)
      .select("id");

    if (deleteError || !deleted || deleted.length === 0) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
      setError(`Couldn't delete "${ev.name || "Untitled event"}"${deleteError ? `: ${deleteError.message}` : "."}`);
      return;
    }

    router.refresh();
    setUndo({
      message: `Deleted "${ev.name || "Untitled event"}". You can restore it from Recently deleted.`,
      restore: () => restoreEvent(ev),
    });
    undoTimerRef.current = setTimeout(() => setUndo(null), 8000);
  }

  async function restoreEvent(ev: EventRow) {
    setRestoringId(ev.id);
    const { data: restored, error: restoreError } = await createClient()
      .from("events")
      .update({ deleted_at: null })
      .eq("id", ev.id)
      .select("id");
    setRestoringId(null);
    if (restoreError || !restored || restored.length === 0) {
      setError(`Couldn't restore "${ev.name || "Untitled event"}"${restoreError ? `: ${restoreError.message}` : "."}`);
      return;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(ev.id);
      return next;
    });
    router.refresh();
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
                  setConfirmDelete(ev);
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

      {deletedEvents.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowDeleted((v) => !v)}
            aria-expanded={showDeleted}
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: C.muted }}
          >
            <ChevronDown size={14} style={{ transform: showDeleted ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }} />
            Recently deleted ({deletedEvents.length})
          </button>
          {showDeleted && (
            <div className="mt-3 flex flex-col gap-2">
              {deletedEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border"
                  style={{ borderColor: C.line, backgroundColor: C.card, opacity: restoringId === ev.id ? 0.6 : 1 }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: C.ink, fontFamily: "Fraunces, serif" }}>
                      {ev.name || "Untitled event"}
                    </div>
                    {ev.deleted_at && (
                      <div className="text-xs" style={{ color: C.muted }}>
                        Deleted {new Date(ev.deleted_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => restoreEvent(ev)}
                    disabled={restoringId === ev.id}
                    className="flex items-center gap-1.5 text-sm font-semibold shrink-0"
                    style={{ color: C.gold }}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(34,31,43,0.45)" }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            className="w-full max-w-sm p-5 rounded-xl shadow-lg"
            style={{ backgroundColor: C.card }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-delete-title" className="text-lg mb-2" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
              Delete &ldquo;{confirmDelete.name || "Untitled event"}&rdquo;?
            </h2>
            <p className="text-sm mb-5" style={{ color: C.muted }}>
              {guestCount(confirmDelete) > 0
                ? `Its ${guestCount(confirmDelete)} guest${guestCount(confirmDelete) === 1 ? "" : "s"}, tables and seating go with it. `
                : ""}
              You can restore it later from Recently deleted at the bottom of this page.
            </p>
            <div className="flex justify-end gap-2">
              <button
                autoFocus
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-2 rounded-lg border text-sm font-medium"
                style={{ borderColor: C.line, color: C.ink }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-3 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: "#8C3B3B", color: "#FFFFFF" }}
              >
                Delete event
              </button>
            </div>
          </div>
        </div>
      )}

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
