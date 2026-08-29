"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, MapPin, Plus, Search, Trash2, Undo2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  card: "#FFFFFF",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  line: "#E4DCC9",
  muted: "#736D5F",
  wine: "#8C3B3B",
};

type TableShape = "round" | "oval" | "square" | "rectangle";
interface TableGroupRow {
  id: string;
  label: string;
  shape: TableShape;
  count: number;
  capacity: number;
}
interface LocationRow {
  id: string;
  owner_id: string;
  name: string;
  capacity: number | null;
  table_groups: TableGroupRow[];
  floor_plan_path: string | null;
  floor_plan_name: string | null;
  created_at: string;
  updated_at: string;
}

const FLOOR_PLAN_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const FLOOR_PLAN_MAX_BYTES = 20 * 1024 * 1024;

function isImagePath(path: string) {
  return /\.(png|jpe?g|webp)$/i.test(path);
}
interface EventRow {
  id: string;
  name: string | null;
  location: string | null;
  event_date: string | null;
}

const SHAPE_LABELS: Record<TableShape, string> = {
  round: "Round",
  oval: "Oval",
  square: "Square",
  rectangle: "Rectangle",
};

function formatEventDate(dateStr: string) {
  // Parse as a plain calendar date (no timezone shift) — same approach as EventsList.tsx.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function summarizeTableGroups(groups: TableGroupRow[]) {
  if (!groups.length) return "No table setup saved yet";
  return groups.map((g) => `${g.count}× ${SHAPE_LABELS[g.shape]} (${g.capacity} seats)`).join(" · ");
}

function newRow(): TableGroupRow {
  return { id: crypto.randomUUID(), label: "Round tables", shape: "round", count: 1, capacity: 8 };
}

export default function LocationsList({
  locations,
  events,
  ownerId,
}: {
  locations: LocationRow[];
  events: EventRow[];
  ownerId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [rows, setRows] = useState<TableGroupRow[]>([]);
  const [floorPlanPath, setFloorPlanPath] = useState<string | null>(null);
  const [floorPlanName, setFloorPlanName] = useState<string | null>(null);
  const [floorPlanUploading, setFloorPlanUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const eventsByLocation = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    events.forEach((ev) => {
      const key = ev.location?.trim().toLowerCase();
      if (!key) return;
      (map[key] = map[key] || []).push(ev);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""))
    );
    return map;
  }, [events]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = locations.filter((loc) => !hiddenIds.has(loc.id));
    if (q) list = list.filter((loc) => loc.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, hiddenIds, search]);

  function openCreateModal() {
    setEditingId(null);
    setName("");
    setCapacity("");
    setRows([]);
    setFloorPlanPath(null);
    setFloorPlanName(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(loc: LocationRow) {
    setEditingId(loc.id);
    setName(loc.name);
    setCapacity(loc.capacity == null ? "" : String(loc.capacity));
    setRows(loc.table_groups.map((g) => ({ ...g })));
    setFloorPlanPath(loc.floor_plan_path);
    setFloorPlanName(loc.floor_plan_name);
    setFormError(null);
    setModalOpen(true);
  }

  function floorPlanPublicUrl(path: string) {
    return createClient().storage.from("floor-plans").getPublicUrl(path).data.publicUrl;
  }

  // Uploads immediately on file select (independent of Save) using a random path under
  // this owner's own folder, decoupled from the location's own id — so it works the same
  // way whether you're editing an existing location or still filling out a brand new one
  // that hasn't been saved yet. The path/name just ride along in the form and get written
  // to the row on Save like any other field.
  async function handleFloorPlanUpload(file: File) {
    setFormError(null);
    if (file.size > FLOOR_PLAN_MAX_BYTES) {
      setFormError("That file is too large — keep it under 20MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `locations/${ownerId}/${crypto.randomUUID()}.${ext}`;
    setFloorPlanUploading(true);
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("floor-plans")
      .upload(path, file, { contentType: file.type || undefined });
    setFloorPlanUploading(false);
    if (uploadError) {
      setFormError(`Couldn't upload that file: ${uploadError.message}`);
      return;
    }
    // Replacing an existing plan — clean up the old file now that the new one is in place.
    if (floorPlanPath) {
      await supabase.storage.from("floor-plans").remove([floorPlanPath]);
    }
    setFloorPlanPath(path);
    setFloorPlanName(file.name);
  }

  async function handleFloorPlanRemove() {
    if (floorPlanPath) {
      await createClient().storage.from("floor-plans").remove([floorPlanPath]);
    }
    setFloorPlanPath(null);
    setFloorPlanName(null);
  }

  function addRow() {
    setRows((r) => [...r, newRow()]);
  }
  function updateRow(id: string, patch: Partial<TableGroupRow>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function removeRow(id: string) {
    setRows((r) => r.filter((row) => row.id !== id));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Give this location a name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const payload = {
      owner_id: ownerId,
      name: trimmed,
      capacity: capacity === "" ? null : Number(capacity),
      table_groups: rows.map((r) => ({ ...r, count: Number(r.count) || 1, capacity: Number(r.capacity) || 1 })),
      floor_plan_path: floorPlanPath,
      floor_plan_name: floorPlanName,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = editingId
      ? await supabase.from("locations").update(payload).eq("id", editingId)
      : await supabase.from("locations").insert(payload);
    setSaving(false);
    if (saveError) {
      setFormError(
        saveError.message.includes("locations_owner_name_unique")
          ? "You already have a location with this name."
          : saveError.message
      );
      return;
    }
    setModalOpen(false);
    router.refresh();
  }

  // Same instant-delete-with-undo-via-reinsert pattern as EventsList.tsx, for the same
  // reason: deferring the actual delete until the undo window expires proved fragile
  // there once navigation was involved, so this goes straight for the reliable version.
  async function handleDelete(loc: LocationRow) {
    setHiddenIds((prev) => new Set(prev).add(loc.id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase.from("locations").delete().eq("id", loc.id);

    if (deleteError) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(loc.id);
        return next;
      });
      setError(`Couldn't delete "${loc.name}": ${deleteError.message}`);
      return;
    }

    router.refresh();
    setUndo({
      message: `Deleted "${loc.name}".`,
      restore: async () => {
        const { error: restoreError } = await supabase.from("locations").insert(loc);
        if (restoreError) {
          setError(`Couldn't restore "${loc.name}": ${restoreError.message}`);
          return;
        }
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(loc.id);
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
      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        {locations.length > 5 ? (
          <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border" style={{ borderColor: C.line, backgroundColor: C.card }}>
            <Search size={14} style={{ color: C.muted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations…"
              aria-label="Search locations"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: C.ink }}
            />
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={openCreateModal}
          className="text-sm font-semibold px-4 py-2.5 rounded-lg self-start sm:self-auto shrink-0 flex items-center gap-1.5"
          style={{ border: "none", backgroundColor: C.gold, color: "#fff", cursor: "pointer" }}
        >
          <Plus size={15} />
          Add location
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="p-6 rounded-xl border text-center" style={{ borderColor: C.line, backgroundColor: C.card }}>
            <p className="text-sm" style={{ color: C.muted }}>
              {search
                ? `No locations match "${search}".`
                : "No saved locations yet — add one to reuse its capacity and table setup on future events."}
            </p>
          </div>
        )}
        {visible.map((loc) => {
          const locEvents = eventsByLocation[loc.name.trim().toLowerCase()] || [];
          return (
            <div key={loc.id} className="p-5 rounded-xl border" style={{ borderColor: C.line, backgroundColor: C.card }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-base font-medium" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
                    <MapPin size={15} style={{ color: C.gold }} />
                    {loc.name}
                  </div>
                  {loc.capacity != null && (
                    <div className="text-xs mt-1" style={{ color: C.ink }}>
                      Capacity: {loc.capacity}
                    </div>
                  )}
                  <div className="text-xs mt-1" style={{ color: C.muted }}>
                    {summarizeTableGroups(loc.table_groups)}
                  </div>
                  {loc.floor_plan_path && (
                    <a
                      href={floorPlanPublicUrl(loc.floor_plan_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs mt-1 inline-flex items-center gap-1"
                      style={{ color: C.gold }}
                    >
                      <FileText size={12} />
                      {loc.floor_plan_name || "Floor plan"}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(loc)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                    style={{ border: `1px solid ${C.line}`, color: C.ink, backgroundColor: "transparent" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(loc)}
                    title="Delete location"
                    aria-label={`Delete ${loc.name}`}
                    className="p-1.5 rounded-lg opacity-60 hover:opacity-100"
                    style={{ color: C.muted }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: C.muted }}>
                  Events here {locEvents.length > 0 && `(${locEvents.length})`}
                </div>
                {locEvents.length === 0 ? (
                  <p className="text-xs" style={{ color: C.muted }}>
                    No events here yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {locEvents.map((ev) => (
                      <li key={ev.id}>
                        <Link
                          href={`/events/${ev.id}`}
                          className="text-xs flex items-center justify-between gap-2"
                          style={{ color: C.ink, textDecoration: "none" }}
                        >
                          <span className="truncate">{ev.name || "Untitled event"}</span>
                          {ev.event_date && (
                            <span className="shrink-0" style={{ color: C.muted }}>
                              {formatEventDate(ev.event_date)}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
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

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(34,31,43,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-modal-title"
            className="w-full rounded-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto"
            style={{ maxWidth: 480, backgroundColor: C.card }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 id="location-modal-title" className="text-2xl" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
                {editingId ? "Edit location" : "Add location"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="p-1 rounded hover:bg-black/5"
                style={{ color: C.muted }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: C.ink }}>
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. The Grand Hall"
                  autoFocus
                  className="px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: C.ink }}>
                  Total capacity
                </span>
                <input
                  type="number"
                  min={0}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Optional"
                  className="px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
              </label>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: C.ink }}>
                    Usual table setup
                  </span>
                  <button
                    type="button"
                    onClick={addRow}
                    className="text-xs font-semibold flex items-center gap-1"
                    style={{ color: C.gold, background: "none", border: "none", cursor: "pointer" }}
                  >
                    <Plus size={13} /> Add table type
                  </button>
                </div>
                {rows.length === 0 && (
                  <p className="text-xs" style={{ color: C.muted }}>
                    Nothing saved yet — add a table type below, or leave this empty and just save the capacity.
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2 flex-wrap">
                      <select
                        value={row.shape}
                        onChange={(e) => updateRow(row.id, { shape: e.target.value as TableShape, label: `${SHAPE_LABELS[e.target.value as TableShape]} tables` })}
                        aria-label="Table shape"
                        className="px-2 py-1.5 rounded-lg border text-xs"
                        style={{ borderColor: C.line, color: C.ink }}
                      >
                        <option value="round">Round</option>
                        <option value="oval">Oval</option>
                        <option value="square">Square</option>
                        <option value="rectangle">Rectangle</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={row.count}
                        onChange={(e) => updateRow(row.id, { count: Number(e.target.value) })}
                        aria-label="Number of tables"
                        title="Number of tables"
                        className="w-16 px-2 py-1.5 rounded-lg border text-xs"
                        style={{ borderColor: C.line, color: C.ink }}
                      />
                      <span className="text-xs" style={{ color: C.muted }}>
                        × table(s),
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={row.capacity}
                        onChange={(e) => updateRow(row.id, { capacity: Number(e.target.value) })}
                        aria-label="Seats per table"
                        title="Seats per table"
                        className="w-16 px-2 py-1.5 rounded-lg border text-xs"
                        style={{ borderColor: C.line, color: C.ink }}
                      />
                      <span className="text-xs" style={{ color: C.muted }}>
                        seats each
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label="Remove table type"
                        className="ml-auto p-1 rounded"
                        style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium block mb-1.5" style={{ color: C.ink }}>
                  Venue floor plan
                </span>
                {floorPlanPath ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border" style={{ borderColor: C.line }}>
                    {isImagePath(floorPlanPath) ? (
                      <img
                        src={floorPlanPublicUrl(floorPlanPath)}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <FileText size={20} style={{ color: C.gold }} className="shrink-0" />
                    )}
                    <a
                      href={floorPlanPublicUrl(floorPlanPath)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs truncate flex-1"
                      style={{ color: C.ink }}
                    >
                      {floorPlanName || "View floor plan"}
                    </a>
                    <button
                      type="button"
                      onClick={handleFloorPlanRemove}
                      className="text-xs font-semibold shrink-0"
                      style={{ color: C.wine, background: "none", border: "none", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed text-xs cursor-pointer"
                    style={{ borderColor: C.line, color: C.muted }}
                  >
                    <Upload size={14} />
                    {floorPlanUploading ? "Uploading…" : "Upload a PDF or image of the venue's seat plan"}
                    <input
                      type="file"
                      accept={FLOOR_PLAN_ACCEPT}
                      disabled={floorPlanUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFloorPlanUpload(file);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {formError && (
                <p className="text-xs" style={{ color: C.wine }}>
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="text-sm font-medium px-3 py-2 rounded-lg"
                  style={{ color: C.muted }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
                  style={{ backgroundColor: C.gold, color: "#fff" }}
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
