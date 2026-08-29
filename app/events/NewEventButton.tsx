"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  card: "#FFFFFF",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#736D5F",
  wine: "#8C3B3B",
};

export default function NewEventButton({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function openModal() {
    setName("");
    setEventDate("");
    setLocation("");
    setMaxCapacity("");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("events")
      .insert({
        name: name.trim() || "Untitled event",
        owner_id: ownerId,
        event_date: eventDate || null,
        location: location.trim() || null,
        max_capacity: maxCapacity === "" ? null : Number(maxCapacity),
        data: {},
      })
      .select()
      .single();
    if (error || !data) {
      setLoading(false);
      setError(error?.message || "Couldn't create the event.");
      return;
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
                  className="px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
              </label>

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
