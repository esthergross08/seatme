"use client";

// All of the seating planner's state, derived data and actions, shared with
// every tab through PlannerContext. Moved out of SeatingPlanner.tsx (2026-10-24)
// so each tab can live in its own file under components/planner/.


import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Trash2,
  Wand2,
  Users,
  LayoutGrid,
  Table2,
  X,
  AlertTriangle,
  Check,
  Sparkles,
  Upload,
  Palette,
  Download,
  FileImage,
  FileText,
  StickyNote,
  Link2,
  Shuffle,
  Undo2,
  Search,
  Share2,
  ClipboardCheck,
  Copy,
  Minus,
  Maximize2,
  Minimize2,
  Move,
  Pencil,
  MapPin,
  RotateCw,
  MessageCircle,
  LayoutDashboard,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import InviteForm from "@/components/InviteForm";
import AgentChat from "@/components/AgentChat";
import DecorPanel from "@/components/DecorPanel";
import { useMapViewport } from "@/components/useMapViewport";
import type { AgentOperation, AgentOperationType, AgentApplyResult } from "@/lib/agentOperations";
import {
  getPosterLayout,
  getPosterPalette,
  getPosterFont,
  migrateLegacyPosterTemplate,
  DEFAULT_POSTER_LAYOUT,
  DEFAULT_POSTER_PALETTE,
  DEFAULT_POSTER_FONT,
} from "@/lib/posterTemplates";
import { C, FONT } from "@/lib/theme";
import { SignedImg, SignedLink } from "@/components/StorageFile";
import EventOverview from "@/components/EventOverview";
import {
  escapeHtml,
  eventInitials,
  formatPosterDate,
  genId,
  guestContextLine,
  guestInitials,
} from "@/lib/planner/utils";
import {
  Constraint,
  FIXTURE_DEFAULTS,
  FIXTURE_MIN_M,
  FillMode,
  Fixture,
  FixtureType,
  FloorPlan,
  GROUP_COLORS,
  Group,
  Guest,
  MenuCourse,
  PX_PER_M,
  RULE_SHORT,
  RsvpStatus,
  RuleType,
  SeatAssignment,
  SeatingPlannerProps,
  TableGroup,
  TableShape,
  fixtureSizeM,
  formatM,
  mergeRemoteRsvps,
  roundM,
} from "@/lib/planner/types";
import {
  FloorBox,
  Seat,
  Table,
  buildSeats,
  buildTables,
  computeLayout,
  makeRoom,
  minSeatSpacing,
  normDeg,
  rectSeatRoles,
  rotateOffset,
  rotatedHalfExtents,
  seatOffset,
  shapeRadius,
  snapDeg,
} from "@/lib/planner/layout";
import {
  aggregateConstraintStatus,
  buildAutoGroupPairs,
  computeFlatViolations,
  expandAllConstraints,
  pickConsolidatedTables,
  solveSeating,
} from "@/lib/planner/rules";
import {
  parseGuestRows,
} from "@/lib/planner/guestImport";
import { createContext, useContext } from "react";
import { IconBtn, SectionTitle, MapMenuButton, FixtureSizeEditor, SettingRow } from "@/components/planner/ui";

export function usePlannerState({
  eventId,
  initialName,
  initialData,
  role,
  members,
  initialEventDate,
  initialLocation,
  initialMaxCapacity,
  initialRsvpEnabled,
  initialUpdatedAt,
}: SeatingPlannerProps) {
  const readOnly = role === "viewer";

  const [eventName, setEventName] = useState(initialName || "Untitled event");
  const [eventDate, setEventDate] = useState(initialEventDate ?? "");
  const [location, setLocation] = useState(initialLocation ?? "");
  const [maxCapacity, setMaxCapacity] = useState<number | "">(initialMaxCapacity ?? "");
  const [rsvpEnabled, setRsvpEnabled] = useState(initialRsvpEnabled ?? false);
  // The active tab is mirrored into the URL (?tab=…) so refreshing the page —
  // or sharing/bookmarking a link — lands back on the same sub-page instead
  // of always resetting to Tables. router.replace (not push) keeps tab
  // switches out of the browser history stack, same as before.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const VALID_TABS = ["overview", "setup", "guests", "seating", "decor"];
  const initialTabParam = searchParams.get("tab");
  const [tab, setTabState] = useState<string>(
    initialTabParam && VALID_TABS.includes(initialTabParam) ? initialTabParam : "overview"
  );
  const setTab = useCallback(
    (id: string) => {
      setTabState(id);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const [tableGroups, setTableGroups] = useState<TableGroup[]>(initialData?.tableGroups ?? []);
  const [guests, setGuests] = useState<Guest[]>(initialData?.guests ?? []);
  const [groups, setGroups] = useState<Group[]>(initialData?.groups ?? []);
  const [constraints, setConstraints] = useState<Constraint[]>(initialData?.constraints ?? []);
  const [seatAssignment, setSeatAssignment] = useState<SeatAssignment>(initialData?.seatAssignment ?? {});
  const [solving, setSolving] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [seatingView, setSeatingView] = useState("map");
  const [highlightNotes, setHighlightNotes] = useState(false);
  // Map view seat style: full name-tag boxes (default, matches every other view) vs.
  // compact colored dots (denser — easier to see a big table's whole shape at a glance).
  const [showGuestNames, setShowGuestNames] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [hoveredGuest, setHoveredGuest] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [fillMode, setFillMode] = useState<FillMode>(initialData?.fillMode ?? "spread");
  const [minimizeChanges, setMinimizeChanges] = useState(true);
  // Stored as the tables to hide (not the ones to show), so tables added later
  // appear automatically instead of being hidden by an old auto-generate.
  const [hiddenTableIds, setHiddenTableIds] = useState<string[]>(initialData?.hiddenTableIds ?? []);
  const hiddenTableSet = useMemo(() => new Set(hiddenTableIds), [hiddenTableIds]);
  const [showAllTables, setShowAllTables] = useState(false);
  const [tableNameOverrides, setTableNameOverrides] = useState<Record<string, string>>(
    initialData?.tableNameOverrides ?? {}
  );
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number; y: number }>>(
    initialData?.tablePositions ?? {}
  );
  const [fixtures, setFixtures] = useState<Fixture[]>(initialData?.fixtures ?? []);
  const [tableRotations, setTableRotations] = useState<Record<string, number>>(initialData?.tableRotations ?? {});
  // Live preview while dragging a rotate handle.
  const [rotating, setRotating] = useState<{ kind: "table" | "fixture"; id: string; deg: number } | null>(null);
  const [fixturePositions, setFixturePositions] = useState<Record<string, { x: number; y: number }>>(
    initialData?.fixturePositions ?? {}
  );
  const [deletedTableIds, setDeletedTableIds] = useState<string[]>(initialData?.deletedTableIds ?? []);
  // Table tapped on the map — shows its "Remove table" action.
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showRemovedTables, setShowRemovedTables] = useState(false);
  // Set when a mouse press actually moved a table/fixture, so the click that
  // follows the drag doesn't also select it.
  const tableJustDragged = useRef(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  // Live preview while dragging a fixture's resize handle (room px).
  const [fixtureResize, setFixtureResize] = useState<{ id: string; cx: number; cy: number; w: number; h: number } | null>(null);
  // Fixture whose "type the exact size" box is open.
  const [sizeEditorId, setSizeEditorId] = useState<string | null>(null);
  // "Move" from the selection menu: the next tap on the map is where it goes —
  // the no-drag way to rearrange the room.
  const [movingItem, setMovingItem] = useState<{ kind: "table" | "fixture"; id: string; label: string } | null>(null);
  // Find-a-guest on the map.
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [highlightSeatId, setHighlightSeatId] = useState<string | null>(null);
  const [dragFixture, setDragFixture] = useState<{ id: string; x: number; y: number } | null>(null);
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(initialData?.floorPlan ?? null);
  // Layout / color / typography are chosen independently (see lib/posterTemplates.ts).
  // Fall back through the legacy single-`posterTemplate` field for events saved
  // before the split, so nobody's prior choice silently resets to the default.
  const legacyPoster = initialData?.posterTemplate ? migrateLegacyPosterTemplate(initialData.posterTemplate) : null;
  const [posterLayout, setPosterLayout] = useState<string>(
    initialData?.posterLayout ?? legacyPoster?.layout ?? DEFAULT_POSTER_LAYOUT
  );
  const [posterPalette, setPosterPalette] = useState<string>(
    initialData?.posterPalette ?? legacyPoster?.palette ?? DEFAULT_POSTER_PALETTE
  );
  const [posterFont, setPosterFont] = useState<string>(
    initialData?.posterFont ?? legacyPoster?.font ?? DEFAULT_POSTER_FONT
  );
  // RSVP form config — simple attending/not-attending only by default; comments
  // (which can cover dietary needs too) is a separate opt-in toggle, and the menu
  // is built course by course (Starter, Main, Dessert, etc.) — a guest picks one
  // option per course the planner has defined; a course with no options yet just
  // doesn't show up on the guest form. Falls back to the old flat `mealOptions`
  // list (pre-courses) as a single "Meal" course, so nobody's existing setup
  // silently disappears.
  const [collectComments, setCollectComments] = useState<boolean>(initialData?.rsvpConfig?.collectComments ?? false);
  const [courses, setCourses] = useState<MenuCourse[]>(
    initialData?.rsvpConfig?.courses ??
      (initialData?.rsvpConfig?.mealOptions?.length
        ? [{ id: genId(), name: "Meal", options: initialData.rsvpConfig.mealOptions }]
        : [])
  );
  const [newCourseOption, setNewCourseOption] = useState<Record<string, string>>({});
  const [floorPlanUploading, setFloorPlanUploading] = useState(false);
  const [floorPlanError, setFloorPlanError] = useState<string | null>(null);
  const [floorPlanSuggesting, setFloorPlanSuggesting] = useState(false);
  const [floorPlanSuggestion, setFloorPlanSuggestion] = useState<{ tables: TableGroup[]; note: string | null } | null>(null);
  const [menuUploading, setMenuUploading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [compactGuestRows, setCompactGuestRows] = useState(false);
  // Inline "add rule" popover state — only one open at a time, keyed by guest id.
  const [addRuleForGuestId, setAddRuleForGuestId] = useState<string | null>(null);
  const [addRuleType, setAddRuleType] = useState<RuleType>("must");
  const [addRuleTargetType, setAddRuleTargetType] = useState<"guest" | "group">("guest");
  const [addRuleTargetId, setAddRuleTargetId] = useState("");
  // Group-vs-group rules (neither side is a specific person) have their own
  // small add-form near group management, since they don't belong to any one
  // guest's row.
  const [showGroupRuleForm, setShowGroupRuleForm] = useState(false);
  const [groupRuleType, setGroupRuleType] = useState<RuleType>("must");
  const [groupRuleAId, setGroupRuleAId] = useState("");
  const [groupRuleBId, setGroupRuleBId] = useState("");
  const [rsvpFilter, setRsvpFilter] = useState<"all" | "attending" | "pending" | "declined">("all");
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const [dragTable, setDragTable] = useState<{ id: string; x: number; y: number } | null>(null);
  const [resizingGroupId, setResizingGroupId] = useState<string | null>(null);
  const [resizePreviewScale, setResizePreviewScale] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    guests: { name: string; groupNames: string[]; email?: string; rsvpStatus?: RsvpStatus; mealChoice?: string }[];
    groupNames: string[];
    declinedCount: number;
    withRsvpData: number;
    withMealData: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showRsvpPanel, setShowRsvpPanel] = useState(false);
  const [rsvpLinkCopied, setRsvpLinkCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapCaptureRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // How much on-screen room the map window has, so table auto-scaling (computeLayout)
  // can grow a small plan's tables to fill it. Set from the zoomable map viewport's
  // measured size, further down, once the layout exists.
  const [canvasBudget, setCanvasBudget] = useState({ width: 0, height: 0 });
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // ---- Supabase autosave ----
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The server version this planner last saved or loaded: each save only lands
  // if the event is still at that version, so a guest's RSVP (or another
  // collaborator's save) made in the meantime is never silently overwritten.
  const lastSyncedAt = useRef<string | null>(initialUpdatedAt ?? null);
  const lastSyncedGuests = useRef<Guest[]>(initialData?.guests ?? []);
  // Saves run one at a time, so an in-flight save is never mistaken for
  // someone else's change by the next one.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (readOnly) return;
    setSaveStatus("saving");
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(runSave, runSave);
    }, 800);

    async function runSave() {
      const supabase = createClient();
      const savedAt = new Date().toISOString();
      const payload = {
        name: eventName,
        event_date: eventDate || null,
        location: location || null,
        max_capacity: maxCapacity === "" ? null : maxCapacity,
        rsvp_enabled: rsvpEnabled,
        data: {
          tableGroups,
          guests,
          groups,
          constraints,
          seatAssignment,
          fillMode,
          tableNameOverrides,
          tablePositions,
          deletedTableIds,
          tableRotations,
          hiddenTableIds,
          floorPlan,
          fixtures,
          fixturePositions,
          posterLayout,
          posterPalette,
          posterFont,
          rsvpConfig: { collectComments, courses },
          eventType: initialData?.eventType,
        },
        updated_at: savedAt,
      };

      const trySave = async (expectedAt: string | null) => {
        let query = supabase.from("events").update(payload).eq("id", eventId);
        if (expectedAt) query = query.eq("updated_at", expectedAt);
        return query.select("updated_at");
      };

      let { data: saved, error } = await trySave(lastSyncedAt.current);

      if (!error && (!saved || saved.length === 0)) {
        // Saved elsewhere since we last synced — usually a guest's RSVP.
        const { data: latest, error: reloadError } = await supabase
          .from("events")
          .select("data, updated_at")
          .eq("id", eventId)
          .single();
        if (reloadError || !latest) {
          setSaveStatus("error");
          return;
        }
        const remoteGuests: Guest[] = Array.isArray(latest.data?.guests) ? latest.data.guests : [];
        const merge = mergeRemoteRsvps(guests, lastSyncedGuests.current, remoteGuests);
        lastSyncedAt.current = latest.updated_at;
        lastSyncedGuests.current = remoteGuests;
        if (merge.changed) {
          // Bring the RSVPs into the planner; that state change triggers a
          // fresh autosave against the version we just read.
          setGuests(merge.guests);
          if (merge.newlyDeclined.length > 0) {
            const declined = new Set(merge.newlyDeclined);
            setSeatAssignment((prev) =>
              Object.fromEntries(Object.entries(prev).filter(([, guestId]) => !declined.has(guestId)))
            );
          }
          return;
        }
        // Nothing RSVP-related to bring in: save our version on top.
        ({ data: saved, error } = await trySave(lastSyncedAt.current));
      }

      if (!error && saved && saved.length > 0) {
        lastSyncedAt.current = saved[0].updated_at;
        lastSyncedGuests.current = guests;
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    }
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    eventName,
    eventDate,
    location,
    maxCapacity,
    rsvpEnabled,
    tableGroups,
    guests,
    groups,
    constraints,
    seatAssignment,
    fillMode,
    tableNameOverrides,
    tablePositions,
    deletedTableIds,
    tableRotations,
    hiddenTableIds,
    floorPlan,
    fixtures,
    fixturePositions,
    posterLayout,
    posterPalette,
    posterFont,
    collectComments,
    courses,
  ]);

  const allTables = useMemo(() => buildTables(tableGroups, tableNameOverrides), [tableGroups, tableNameOverrides]);
  const deletedTableSet = useMemo(() => new Set(deletedTableIds), [deletedTableIds]);
  // Everything downstream (seats, capacity, auto-generate, exports, the map) only
  // ever sees tables that are still on the floor plan.
  const tables = useMemo(() => allTables.filter((t) => !deletedTableSet.has(t.id)), [allTables, deletedTableSet]);
  const deletedTables = useMemo(() => allTables.filter((t) => deletedTableSet.has(t.id)), [allTables, deletedTableSet]);
  const tableById = useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t])), [tables]);
  const seats = useMemo(() => buildSeats(tables), [tables]);
  const seatsById = useMemo(() => Object.fromEntries(seats.map((s) => [s.id, s])), [seats]);
  const totalSeats = seats.length;

  const occupiedTableIds = useMemo(() => {
    const set = new Set<string>();
    Object.entries(seatAssignment).forEach(([seatId, guestId]) => {
      if (guestId && seatsById[seatId]) set.add(seatsById[seatId].tableId);
    });
    return set;
  }, [seatAssignment, seatsById]);

  const visibleTables = useMemo(() => {
    if (showAllTables || hiddenTableSet.size === 0) return tables;
    return tables.filter((t) => !hiddenTableSet.has(t.id) || occupiedTableIds.has(t.id));
  }, [tables, hiddenTableSet, showAllTables, occupiedTableIds]);

  const hiddenTableCount = tables.length - visibleTables.length;
  const emptyVisibleTableIds = useMemo(
    () => visibleTables.filter((t) => !occupiedTableIds.has(t.id)).map((t) => t.id),
    [visibleTables, occupiedTableIds]
  );
  const layout = useMemo(
    () => computeLayout(visibleTables, tablePositions, canvasBudget),
    [visibleTables, tablePositions, canvasBudget]
  );

  // Zoom/pan window around the floor plan — opens on the whole room, pinch or
  // scroll to zoom in (see useMapViewport).
  // Fixtures (dance floor, bar, stage) at true scale relative to the tables. Ones
  // that haven't been placed by hand line up in a row below the tables, so they
  // never land on top of one. The room's bounds grow to include them, so "All"
  // shows everything.
  const fixtureGuestCount = useMemo(() => guests.filter((g) => g.rsvpStatus !== "declined").length, [guests]);
  const room = useMemo(() => {
    const positions: Record<string, { cx: number; cy: number; w: number; h: number }> = {};
    let width = layout.width;
    let height = layout.height;
    let nextX = 40;
    const rowTop = layout.height + 10;
    fixtures.forEach((f) => {
      const m = fixtureSizeM(f, fixtureGuestCount);
      const k = PX_PER_M * layout.scale;
      const w = m.w * k;
      const h = m.h * k;
      const saved = fixturePositions[f.id];
      let cx: number, cy: number;
      if (saved) {
        cx = saved.x;
        cy = saved.y;
      } else {
        cx = nextX + w / 2;
        cy = rowTop + h / 2;
        nextX += w + 50;
      }
      positions[f.id] = { cx, cy, w, h };
      width = Math.max(width, cx + w / 2 + 40);
      height = Math.max(height, cy + h / 2 + 40);
    });
    return { fixtures: positions, width, height };
  }, [fixtures, fixturePositions, fixtureGuestCount, layout.width, layout.height, layout.scale]);

  const map = useMapViewport(room.width, room.height);

  const tableRot = (id: string) => (rotating?.kind === "table" && rotating.id === id ? rotating.deg : tableRotations[id] || 0);
  const fixtureRot = (f: Fixture) => (rotating?.kind === "fixture" && rotating.id === f.id ? rotating.deg : f.rot || 0);

  // Drag a rotate handle around an item's centre (room coords cx, cy).
  function beginRotate(
    e: React.PointerEvent<HTMLElement>,
    kind: "table" | "fixture",
    id: string,
    cx: number,
    cy: number,
    startDeg: number,
    commit: (deg: number) => void
  ) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    map.beginItemDrag();
    const p0 = map.toRoom(e.clientX, e.clientY);
    const a0 = Math.atan2(p0.y - cy, p0.x - cx);
    let deg = startDeg;
    setRotating({ kind, id, deg });
    const onMove = (ev: PointerEvent) => {
      const p = map.toRoom(ev.clientX, ev.clientY);
      const a = Math.atan2(p.y - cy, p.x - cx);
      deg = snapDeg(startDeg + ((a - a0) * 180) / Math.PI, ev.shiftKey);
      setRotating({ kind, id, deg });
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      map.endItemDrag();
      commit(deg);
      setRotating(null);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }
  function setTableRotation(tableId: string, deg: number) {
    if (readOnly) return;
    // Pin an auto-placed table where it's drawn, so turning it doesn't reflow the grid.
    const pos = layout.positions[tableId];
    if (pos && !tablePositions[tableId]) setTablePositions((m) => ({ ...m, [tableId]: { x: pos.cx, y: pos.cy } }));
    setTableRotations((m) => {
      const next = { ...m };
      const d = normDeg(deg);
      if (d === 0) delete next[tableId];
      else next[tableId] = d;
      return next;
    });
  }
  function setFixtureRotation(fixtureId: string, deg: number) {
    if (readOnly) return;
    const fl = room.fixtures[fixtureId];
    if (fl && !fixturePositions[fixtureId]) setFixturePositions((m) => ({ ...m, [fixtureId]: { x: fl.cx, y: fl.cy } }));
    setFixtures((list) => list.map((x) => (x.id === fixtureId ? { ...x, rot: normDeg(deg) || undefined } : x)));
  }

  // General rule: when anything on the floor plan gets bigger — Bigger/Smaller,
  // the resize handle, more seats, a different shape, a longer name, a dance
  // floor growing with the guest list — whatever it now overlaps is nudged aside.
  // Detected by comparing each item's size with the previous render, so every
  // kind of resize is covered without each one having to remember to call it.
  const prevFootprints = useRef<{ scale: number; sizes: Record<string, { w: number; h: number }> } | null>(null);
  useEffect(() => {
    // Footprints as the axis-aligned box each item covers — so turning a long
    // table or the bar counts as "getting bigger" in the directions it now reaches.
    const fxById = Object.fromEntries(fixtures.map((f) => [f.id, f]));
    const tableBox = (id: string, p: { w: number; h: number }) => rotatedHalfExtents(p.w / 2 + 64, p.h / 2 + 64, tableRotations[id] || 0);
    const fixtureBox = (id: string, p: { w: number; h: number }) => rotatedHalfExtents(p.w / 2 + 20, p.h / 2 + 20, fxById[id]?.rot || 0);
    const sizes: Record<string, { w: number; h: number }> = {};
    Object.entries(layout.positions).forEach(([id, p]) => {
      const b = tableBox(id, p);
      sizes[`t:${id}`] = { w: b.hw * 2, h: b.hh * 2 };
    });
    Object.entries(room.fixtures).forEach(([id, p]) => {
      const b = fixtureBox(id, p);
      sizes[`f:${id}`] = { w: b.hw * 2, h: b.hh * 2 };
    });
    const prev = prevFootprints.current;
    prevFootprints.current = { scale: layout.scale, sizes };
    // Skip the first look, view-only access, mid-drag, and whole-plan rescaling
    // (the layout auto-zooming small plans changes every size at once — that's
    // not someone resizing a thing).
    if (!prev || readOnly || dragTable || resizingGroupId || fixtureResize || rotating || prev.scale !== layout.scale) return;
    const grown = new Set(
      Object.keys(sizes).filter((k) => prev.sizes[k] && (sizes[k].w > prev.sizes[k].w + 0.5 || sizes[k].h > prev.sizes[k].h + 0.5))
    );
    if (grown.size === 0) return;

    // Tables: seats sit 34px out from the edge and name tags reach ~30px past that.
    const boxes: FloorBox[] = [
      ...Object.entries(layout.positions).map(([id, p]) => ({ id: `t:${id}`, cx: p.cx, cy: p.cy, ...tableBox(id, p) })),
      ...Object.entries(room.fixtures).map(([id, p]) => ({ id: `f:${id}`, cx: p.cx, cy: p.cy, ...fixtureBox(id, p) })),
    ];
    const { positions: moved, pushed } = makeRoom(boxes, grown);
    if (pushed.length === 0) return;

    // Pin everything where it's drawn now (plus the moves), so tables that were
    // auto-placed don't reflow into new spots once some of them are pinned.
    const prevTablePositions = tablePositions;
    const prevFixturePositions = fixturePositions;
    const nextTables: Record<string, { x: number; y: number }> = { ...tablePositions };
    Object.entries(layout.positions).forEach(([id, p]) => (nextTables[id] = moved[`t:${id}`] ?? { x: p.cx, y: p.cy }));
    const nextFixtures: Record<string, { x: number; y: number }> = { ...fixturePositions };
    Object.entries(room.fixtures).forEach(([id, p]) => (nextFixtures[id] = moved[`f:${id}`] ?? { x: p.cx, y: p.cy }));
    setTablePositions(nextTables);
    setFixturePositions(nextFixtures);

    const tableCount = pushed.filter((k) => k.startsWith("t:")).length;
    const otherCount = pushed.length - tableCount;
    const parts = [
      tableCount ? `${tableCount} table${tableCount > 1 ? "s" : ""}` : "",
      otherCount ? `${otherCount} other item${otherCount > 1 ? "s" : ""}` : "",
    ].filter(Boolean);
    pushUndo(`Moved ${parts.join(" and ")} to make room.`, () => {
      setTablePositions(prevTablePositions);
      setFixturePositions(prevFixturePositions);
    });
    // Only re-run when sizes/positions change; the state read above is current for this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, room, tableRotations, fixtures]);
  useEffect(() => {
    if (!map.size.width || !map.size.height) return;
    const width = Math.max(320, map.size.width - 32);
    const height = Math.max(320, map.size.height - 32);
    setCanvasBudget((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, [map.size.width, map.size.height]);

  // Name tags are only legible once you're zoomed in, so at the whole-room view the
  // map shows compact dots and switches to names as you zoom in — like labels
  // appearing on a map. Two thresholds so it doesn't flicker right at the switch.
  // The "Hide names" button still turns names off at every zoom level.
  const [zoomedInForNames, setZoomedInForNames] = useState(true);
  const mapScale = map.view.scale;
  useEffect(() => {
    setZoomedInForNames((prev) => (prev ? mapScale >= 0.7 : mapScale >= 0.8));
  }, [mapScale]);
  const namesOnMap = showGuestNames && zoomedInForNames;

  // Until names show (~80% zoom), seats are dots too small to hit reliably on a
  // phone (10–13 px on screen), so tapping a table or seat zooms in to that table
  // instead of acting on it. Once names show, a name tag is ~58×25 px or larger.
  const atOverview = !zoomedInForNames;
  function zoomToTable(tableId: string) {
    const pos = layout.positions[tableId];
    if (!pos) return;
    const box = pos.seatR * 2 + 140; // seats + their name tags
    // Land zoomed in far enough that names are showing.
    map.flyTo(pos.cx, pos.cy, box, box, { maxScale: 1.3, minZoom: 0.85 });
  }
  function clearMapSelection() {
    setSelectedTableId(null);
    setSelectedFixtureId(null);
    setSizeEditorId(null);
  }


  function showGuestOnMap(guestId: string) {
    const seatId = seatOfGuest[guestId];
    setMapSearchOpen(false);
    setMapSearchQuery("");
    clearMapSelection();
    if (seatId && seatsById[seatId] && layout.positions[seatsById[seatId].tableId]) {
      const p = seatPixel(seatId);
      map.flyTo(p.x, p.y, 380, 380, { maxScale: 1.3, minZoom: 0.9 });
      setHighlightSeatId(seatId);
    } else if (!readOnly) {
      // Not seated yet — pick them up so the next tap on a seat places them.
      setPicked(guestId);
    }
  }
  useEffect(() => {
    if (!highlightSeatId) return;
    const t = setTimeout(() => setHighlightSeatId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightSeatId]);

  // Tap on the map while "Move" is active places the item there.
  function placeMovingItem(clientX: number, clientY: number) {
    if (!movingItem) return;
    const p = map.toRoom(clientX, clientY);
    if (movingItem.kind === "table") {
      const pos = layout.positions[movingItem.id];
      const min = (pos?.seatR ?? 60) + 10;
      moveTable(movingItem.id, Math.max(min, p.x), Math.max(min, p.y));
    } else {
      const dims = room.fixtures[movingItem.id] ?? { w: 100, h: 60 };
      moveFixture(movingItem.id, Math.max(dims.w / 2, p.x), Math.max(dims.h / 2, p.y));
    }
    setMovingItem(null);
  }

  // Entering/leaving full screen goes back to the whole-room overview at the new size.
  const fitMap = map.fit;
  useEffect(() => {
    fitMap();
    // Only on toggle — fitMap changes identity whenever the size does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFullscreen]);

  // Esc leaves full-screen map; the page behind doesn't scroll while it's open.
  useEffect(() => {
    if (!mapFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mapFullscreen]);

  // On touch screens a table only picks up after a short press-and-hold, so a
  // quick swipe across the room pans the map instead of dragging tables around.
  function startLongPress(e: React.TouchEvent, begin: (clientX: number, clientY: number) => void) {
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return;
    const startX = touch.clientX;
    const startY = touch.clientY;
    const timer = window.setTimeout(() => {
      cleanup();
      (document.activeElement as HTMLElement | null)?.blur?.();
      try {
        navigator.vibrate?.(12);
      } catch {
        // vibration unsupported — fine
      }
      begin(startX, startY);
    }, 380);
    function onMove(ev: TouchEvent) {
      const t = ev.touches[0];
      if (ev.touches.length > 1 || !t || Math.hypot(t.clientX - startX, t.clientY - startY) > 8) cleanup();
    }
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", cleanup);
      window.removeEventListener("touchcancel", cleanup);
    }
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", cleanup);
    window.addEventListener("touchcancel", cleanup);
  }

  const guestById = useMemo(() => Object.fromEntries(guests.map((g) => [g.id, g])), [guests]);
  const visibleGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    let filtered = q
      ? guests.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            (g.note ?? "").toLowerCase().includes(q) ||
            (g.rsvpComment ?? "").toLowerCase().includes(q) ||
            (g.mealChoice ?? "").toLowerCase().includes(q)
        )
      : guests;
    if (rsvpFilter !== "all") {
      filtered = filtered.filter((g) => (g.rsvpStatus ?? "pending") === rsvpFilter);
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [guests, guestSearch, rsvpFilter]);
  // First guest id for each letter, in the sorted+filtered list — powers the A-Z jump index.
  const guestLetterIndex = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of visibleGuests) {
      const letter = (g.name.trim()[0] || "#").toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : "#";
      if (!(key in m)) m[key] = g.id;
    }
    return m;
  }, [visibleGuests]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const guestsByGroupId = useMemo(() => {
    const m: Record<string, string[]> = {};
    guests.forEach((g) => (g.groupIds || []).forEach((gid) => (m[gid] = m[gid] || []).push(g.id)));
    return m;
  }, [guests]);

  // ---- reconciliation: prune anything that points at a guest/group/table
  // that no longer exists (deleted via the UI, the AI assistant, or a table
  // capacity shrink). Runs whenever the source-of-truth lists change; only
  // calls setState when something actually needed pruning, so this is a
  // no-op on every normal render.
  useEffect(() => {
    if (readOnly) return;
    const validGuestIds = new Set(guests.map((g) => g.id));
    const validGroupIds = new Set(groups.map((g) => g.id));
    const validSeatIds = new Set(seats.map((s) => s.id));
    const validTableIds = new Set(tables.map((t) => t.id));

    setSeatAssignment((prev) => {
      let changed = false;
      const next: SeatAssignment = {};
      for (const [seatId, guestId] of Object.entries(prev)) {
        if (validSeatIds.has(seatId) && guestId && validGuestIds.has(guestId)) {
          next[seatId] = guestId;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setConstraints((prev) => {
      const next = prev.filter((c) => {
        const aOk = c.aType === "group" ? validGroupIds.has(c.aId) : validGuestIds.has(c.aId);
        const bOk = c.bType === "group" ? validGroupIds.has(c.bId) : validGuestIds.has(c.bId);
        return aOk && bOk;
      });
      return next.length === prev.length ? prev : next;
    });

    setTablePositions((prev) => {
      let changed = false;
      const next: Record<string, { x: number; y: number }> = {};
      for (const [tableId, pos] of Object.entries(prev)) {
        if (validTableIds.has(tableId)) next[tableId] = pos;
        else changed = true;
      }
      return changed ? next : prev;
    });

    setTableNameOverrides((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [tableId, name] of Object.entries(prev)) {
        if (validTableIds.has(tableId)) next[tableId] = name;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [guests, groups, seats, tables, readOnly]);

  const seatOfGuest = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(seatAssignment).forEach(([seatId, guestId]) => {
      if (guestId) m[guestId] = seatId;
    });
    return m;
  }, [seatAssignment]);

  // Guests matching the map search box (seated first, then unseated).
  const mapSearchResults = useMemo(() => {
    const q = mapSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return guests
      .filter((g) => g.name.toLowerCase().includes(q))
      .map((g) => ({ guest: g, seatId: seatOfGuest[g.id] as string | undefined }))
      .sort((a, b) => Number(!a.seatId) - Number(!b.seatId) || a.guest.name.localeCompare(b.guest.name))
      .slice(0, 8);
  }, [mapSearchQuery, guests, seatOfGuest]);
  const activeGuests = useMemo(() => guests.filter((g) => g.rsvpStatus !== "declined"), [guests]);
  const unseatedGuests = useMemo(() => activeGuests.filter((g) => !seatOfGuest[g.id]), [activeGuests, seatOfGuest]);
  const seatedCount = activeGuests.length - unseatedGuests.length;
  const notedGuests = useMemo(() => guests.filter((g) => g.note && g.note.trim().length > 0), [guests]);
  const notedGuestCount = notedGuests.length;

  const mealStats = useMemo(() => {
    const counts: Record<string, number> = {};
    activeGuests.forEach((g) => {
      const choice = g.mealChoice?.trim();
      if (choice) counts[choice] = (counts[choice] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([choice, count]) => ({ choice, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeGuests]);

  const groupStats = useMemo(() => {
    const stats = groups.map((gr) => {
      const members = activeGuests.filter((g) => g.groupIds?.includes(gr.id));
      const seated = members.filter((g) => seatOfGuest[g.id]).length;
      return { group: gr, total: members.length, seated };
    });
    const ungroupedMembers = activeGuests.filter((g) => !g.groupIds || g.groupIds.length === 0);
    const ungrouped = {
      total: ungroupedMembers.length,
      seated: ungroupedMembers.filter((g) => seatOfGuest[g.id]).length,
    };
    return { byGroup: stats, ungrouped };
  }, [groups, activeGuests, seatOfGuest]);

  const occupiedCountByTable = useMemo(() => {
    const m: Record<string, number> = {};
    Object.entries(seatAssignment).forEach(([seatId, guestId]) => {
      if (guestId && seatsById[seatId]) {
        const tid = seatsById[seatId].tableId;
        m[tid] = (m[tid] || 0) + 1;
      }
    });
    return m;
  }, [seatAssignment, seatsById]);

  const underfilledTables = useMemo(() => {
    if (seatedCount === 0) return [];
    return visibleTables
      .map((t) => ({ table: t, occupied: occupiedCountByTable[t.id] || 0 }))
      .filter((x) => x.table.capacity > 0 && x.occupied / x.table.capacity < 0.5);
  }, [visibleTables, occupiedCountByTable, seatedCount]);

  const flatPairs = useMemo(() => expandAllConstraints(constraints, guestsByGroupId), [constraints, guestsByGroupId]);
  const autoGroupPairs = useMemo(() => buildAutoGroupPairs(groups, guestsByGroupId), [groups, guestsByGroupId]);
  const flatViolations = useMemo(() => computeFlatViolations(flatPairs, seatAssignment, seatsById), [flatPairs, seatAssignment, seatsById]);
  const constraintStatuses = useMemo(() => aggregateConstraintStatus(constraints, flatViolations), [constraints, flatViolations]);
  const violatedCount = Object.values(constraintStatuses).filter((s) => s === "violated").length;
  const sideLabel = (type: "guest" | "group", id: string) =>
    (type === "group" ? groupById[id]?.name : guestById[id]?.name) || "—";

  // Per-guest view of the same rules shown in the "Seating constraints" list
  // below, so each guest's row can surface their own rules directly (a group
  // rule fans out to every member) without needing a separate lookup.
  const constraintTagsByGuestId = useMemo(() => {
    const map: Record<string, { constraintId: string; type: RuleType; label: string }[]> = {};
    const addTag = (guestId: string, constraintId: string, type: RuleType, label: string) => {
      (map[guestId] ??= []).push({ constraintId, type, label });
    };
    for (const c of constraints) {
      const sides = [
        { type: c.aType, id: c.aId },
        { type: c.bType, id: c.bId },
      ] as const;
      for (let i = 0; i < 2; i++) {
        const mine = sides[i];
        const other = sides[1 - i];
        const otherLabel = other.type === "group" ? groupById[other.id]?.name : guestById[other.id]?.name;
        if (!otherLabel) continue;
        if (mine.type === "guest") {
          addTag(mine.id, c.id, c.type, otherLabel);
        } else {
          for (const gid of guestsByGroupId[mine.id] ?? []) addTag(gid, c.id, c.type, otherLabel);
        }
      }
    }
    return map;
  }, [constraints, guestById, groupById, guestsByGroupId]);
  const liveSummary = useMemo(() => {
    const relevant = constraints.filter((c) => constraintStatuses[c.id] !== "empty");
    if (relevant.length === 0) return null;
    return {
      total: relevant.length,
      satisfied: relevant.filter((c) => constraintStatuses[c.id] === "satisfied").length,
      violated: relevant.filter((c) => constraintStatuses[c.id] === "violated"),
    };
  }, [constraints, constraintStatuses]);

  useEffect(() => {
    setSeatAssignment((prev) => {
      const next: SeatAssignment = {};
      let changed = false;
      Object.entries(prev).forEach(([seatId, guestId]) => {
        if (seatsById[seatId] && guestById[guestId]) next[seatId] = guestId;
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [seatsById, guestById]);


  useEffect(() => {
    if (!importSuccess) return;
    const t = setTimeout(() => setImportSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [importSuccess]);

  useEffect(() => {
    setConstraints((prev) =>
      prev.filter((c) => {
        const aOk = c.aType === "group" ? !!groupById[c.aId] : !!guestById[c.aId];
        const bOk = c.bType === "group" ? !!groupById[c.bId] : !!guestById[c.bId];
        return aOk && bOk;
      })
    );
  }, [guestById, groupById]);

  function seatPixel(seatId: string | undefined) {
    if (!seatId) return { x: 0, y: 0 };
    const s = seatsById[seatId];
    if (!s) return { x: 0, y: 0 };
    const pos = layout.positions[s.tableId];
    if (!pos) return { x: 0, y: 0 };
    const table = tableById[s.tableId];
    const shape = table?.shape ?? "round";
    const o = seatOffset(shape, pos.w, pos.h, s.seatIdx, s.capacity, 34, table?.headCount, table?.footCount);
    const { dx, dy } = rotateOffset(o.dx, o.dy, tableRotations[s.tableId] || 0);
    return { x: pos.cx + dx, y: pos.cy + dy };
  }

  // ---- undo (destructive actions stay instant — no confirm — but offer a brief undo) ----
  function pushUndo(message: string, restore: () => void) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ message, restore });
    undoTimerRef.current = setTimeout(() => setUndo(null), 8000);
  }
  function performUndo() {
    if (!undo) return;
    undo.restore();
    setUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  // ---- table group handlers ----
  const addTableGroup = () => {
    if (readOnly) return;
    setTableGroups((tg) => [...tg, { id: genId(), label: `Table type ${tg.length + 1}`, count: 1, capacity: 8, shape: "round" }]);
  };
  const updateTableGroup = (id: string, patch: Partial<TableGroup>) => {
    if (readOnly) return;
    setTableGroups((tg) => tg.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };
  const removeTableGroup = (id: string) => {
    if (readOnly) return;
    const removedIds = new Set(buildTables(tableGroups.filter((g) => g.id === id), tableNameOverrides).map((t) => t.id));
    setTableGroups((tg) => tg.filter((g) => g.id !== id));
    if (removedIds.size > 0) {
      setTableNameOverrides((m) => {
        const next = { ...m };
        removedIds.forEach((tid) => delete next[tid]);
        return next;
      });
      setTablePositions((m) => {
        const next = { ...m };
        removedIds.forEach((tid) => delete next[tid]);
        return next;
      });
    }
  };
  const removeTableGroupWithUndo = (id: string) => {
    if (readOnly) return;
    const tg = tableGroups.find((g) => g.id === id);
    if (!tg) return;
    const prevTableGroups = tableGroups;
    const prevSeatAssignment = seatAssignment;
    const prevTableNameOverrides = tableNameOverrides;
    const prevTablePositions = tablePositions;
    removeTableGroup(id);
    pushUndo(`Removed table type "${tg.label}".`, () => {
      setTableGroups(prevTableGroups);
      setSeatAssignment(prevSeatAssignment);
      setTableNameOverrides(prevTableNameOverrides);
      setTablePositions(prevTablePositions);
    });
  };
  const renameTable = (tableId: string, name: string) => {
    if (readOnly) return;
    setTableNameOverrides((m) => ({ ...m, [tableId]: name }));
  };
  const moveTable = (tableId: string, x: number, y: number) => {
    if (readOnly) return;
    setTablePositions((m) => ({ ...m, [tableId]: { x, y } }));
  };
  // Take one empty table off the floor plan. Its name and position are kept, so
  // adding it back puts it right where it was. Tables with guests can't be
  // removed — move or unseat them first — so nobody silently loses a seat.
  const deleteTableWithUndo = (tableId: string) => {
    if (readOnly) return;
    const t = tableById[tableId];
    if (!t || occupiedTableIds.has(tableId)) return;
    // Pin it to where it's drawn now, so restoring it doesn't re-flow into a new spot.
    const pos = layout.positions[tableId];
    if (pos && !tablePositions[tableId]) {
      setTablePositions((m) => ({ ...m, [tableId]: { x: pos.cx, y: pos.cy } }));
    }
    setDeletedTableIds((ids) => (ids.includes(tableId) ? ids : [...ids, tableId]));
    setSelectedTableId(null);
    pushUndo(`Removed ${t.label}.`, () => setDeletedTableIds((ids) => ids.filter((id) => id !== tableId)));
  };
  const restoreTable = (tableId: string) => {
    if (readOnly) return;
    setDeletedTableIds((ids) => ids.filter((id) => id !== tableId));
  };
  const restoreAllTables = () => {
    if (readOnly) return;
    setDeletedTableIds([]);
    setShowRemovedTables(false);
  };

  // ---- fixture handlers (non-seating floor plan elements: dance floor, bar, stage) ----
  const addFixture = (type: FixtureType) => {
    if (readOnly) return;
    setFixtures((f) => [...f, { id: genId(), type }]);
  };
  const renameFixture = (id: string, label: string) => {
    if (readOnly) return;
    setFixtures((f) => f.map((x) => (x.id === id ? { ...x, label } : x)));
  };
  // Set a fixture's exact size in metres (keeps its centre where it is).
  const setFixtureSizeM = (fixtureId: string, wM: number, hM: number) => {
    if (readOnly) return;
    setFixtures((list) =>
      list.map((x) => (x.id === fixtureId ? { ...x, wM: roundM(wM), hM: roundM(hM), sizeScale: undefined } : x))
    );
  };
  // Bigger/Smaller in the tap menu: scale both sides together.
  const resizeFixture = (fixtureId: string, factor: number) => {
    const f = fixtures.find((x) => x.id === fixtureId);
    if (!f) return;
    const m = fixtureSizeM(f, fixtureGuestCount);
    setFixtureSizeM(fixtureId, m.w * factor, m.h * factor);
  };
  const moveFixture = (fixtureId: string, x: number, y: number) => {
    if (readOnly) return;
    setFixturePositions((m) => ({ ...m, [fixtureId]: { x, y } }));
  };
  const removeFixtureWithUndo = (id: string) => {
    if (readOnly) return;
    const fx = fixtures.find((f) => f.id === id);
    if (!fx) return;
    const prevFixtures = fixtures;
    const prevFixturePositions = fixturePositions;
    setFixtures((f) => f.filter((x) => x.id !== id));
    setFixturePositions((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    pushUndo(`Removed ${fx.label ?? FIXTURE_DEFAULTS[fx.type].label}.`, () => {
      setFixtures(prevFixtures);
      setFixturePositions(prevFixturePositions);
    });
  };

  // ---- guest handlers ----
  const addGuest = () => {
    if (readOnly) return;
    const name = newGuestName.trim();
    if (!name) return;
    setGuests((g) => [...g, { id: genId(), name, groupIds: [] }]);
    setNewGuestName("");
  };
  const renameGuest = (id: string, name: string) => {
    if (readOnly) return;
    setGuests((g) => g.map((x) => (x.id === id ? { ...x, name } : x)));
  };
  const updateGuestNote = (id: string, note: string) => {
    if (readOnly) return;
    setGuests((g) => g.map((x) => (x.id === id ? { ...x, note } : x)));
  };
  const updateGuestMealChoice = (id: string, mealChoice: string) => {
    if (readOnly) return;
    setGuests((g) => g.map((x) => (x.id === id ? { ...x, mealChoice } : x)));
  };
  const cycleRsvpStatus = (id: string) => {
    if (readOnly) return;
    const order: RsvpStatus[] = ["pending", "attending", "declined"];
    let becameDeclined = false;
    setGuests((g) =>
      g.map((x) => {
        if (x.id !== id) return x;
        const current = x.rsvpStatus ?? "pending";
        const next = order[(order.indexOf(current) + 1) % order.length];
        if (next === "declined") becameDeclined = true;
        return { ...x, rsvpStatus: next };
      })
    );
    if (becameDeclined) {
      setSeatAssignment((prev) => {
        const seatId = Object.entries(prev).find(([, guestId]) => guestId === id)?.[0];
        if (!seatId) return prev;
        const next = { ...prev };
        delete next[seatId];
        return next;
      });
    }
  };
  const removeGuest = (id: string) => {
    if (readOnly) return;
    setGuests((g) => g.filter((x) => x.id !== id));
  };
  const removeGuestWithUndo = (id: string) => {
    if (readOnly) return;
    const guest = guests.find((g) => g.id === id);
    if (!guest) return;
    const prevGuests = guests;
    const prevConstraints = constraints;
    const prevSeatAssignment = seatAssignment;
    removeGuest(id);
    pushUndo(`Removed ${guest.name}.`, () => {
      setGuests(prevGuests);
      setConstraints(prevConstraints);
      setSeatAssignment(prevSeatAssignment);
    });
  };
  const toggleGuestGroup = (guestId: string, groupId: string) => {
    if (readOnly) return;
    setGuests((gs) =>
      gs.map((g) =>
        g.id === guestId
          ? {
              ...g,
              groupIds: g.groupIds.includes(groupId)
                ? g.groupIds.filter((x) => x !== groupId)
                : [...g.groupIds, groupId],
            }
          : g
      )
    );
  };

  // ---- spreadsheet import ----
  async function logImport(guestCount: number, mode: string, hadRsvpData: boolean, hadMealData: boolean) {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("import_log").insert({
        event_id: eventId,
        user_id: user.id,
        guest_count: guestCount,
        mode,
        had_rsvp_data: hadRsvpData,
        had_meal_data: hadMealData,
      });
    } catch {
      // best-effort only — never let logging affect the import itself
    }
  }

  function finishParse(raw: unknown[][]) {
    const { guests: parsedGuests, groupNamesFound, declinedCount, withRsvpData, withMealData } = parseGuestRows(raw);
    if (parsedGuests.length === 0) {
      setImportError("Couldn't find any names in that file — make sure there's a column of guest names.");
      return;
    }
    setImportError(null);
    setPendingImport({
      guests: parsedGuests,
      groupNames: [...groupNamesFound],
      declinedCount,
      withRsvpData,
      withMealData,
    });
  }

  const FLOOR_PLAN_MAX_BYTES = 20 * 1024 * 1024;

  // Uploads under this event's own folder so the storage RLS policy (which checks
  // owner/editor via the same is_event_owner/is_event_editor functions used everywhere
  // else) can grant access to collaborators, not just the owner.
  async function handleFloorPlanUpload(file: File) {
    if (readOnly) return;
    setFloorPlanError(null);
    if (file.size > FLOOR_PLAN_MAX_BYTES) {
      setFloorPlanError("That file is too large — keep it under 20MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `events/${eventId}/${crypto.randomUUID()}.${ext}`;
    setFloorPlanUploading(true);
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("floor-plans")
      .upload(path, file, { contentType: file.type || undefined });
    setFloorPlanUploading(false);
    if (uploadError) {
      setFloorPlanError(`Couldn't upload that file: ${uploadError.message}`);
      return;
    }
    if (floorPlan) {
      await supabase.storage.from("floor-plans").remove([floorPlan.path]);
    }
    setFloorPlan({ path, name: file.name });
    setFloorPlanSuggestion(null);
  }

  async function handleFloorPlanRemove() {
    if (readOnly || !floorPlan) return;
    await createClient().storage.from("floor-plans").remove([floorPlan.path]);
    setFloorPlan(null);
    setFloorPlanSuggestion(null);
  }


  // Proposes a table setup from the uploaded floor plan via Claude vision, but doesn't
  // touch tableGroups until the user explicitly hits Apply — same propose-then-confirm
  // shape as the AI seating assistant elsewhere in this component.
  async function handleSuggestFromFloorPlan() {
    if (readOnly || !floorPlan) return;
    setFloorPlanSuggesting(true);
    setFloorPlanError(null);
    setFloorPlanSuggestion(null);
    try {
      const res = await fetch("/api/floor-plan/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: "event", eventId, path: floorPlan.path }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFloorPlanError(json.error || "Couldn't read that floor plan.");
        return;
      }
      const tables: TableGroup[] = (json.tables || []).map((t: { shape: TableShape; count: number; capacity: number }) => ({
        id: genId(),
        label: `${t.shape[0].toUpperCase()}${t.shape.slice(1)} tables`,
        shape: t.shape,
        count: t.count,
        capacity: t.capacity,
      }));
      if (tables.length === 0) {
        setFloorPlanError(json.note || "Couldn't make out any tables in that floor plan.");
        return;
      }
      setFloorPlanSuggestion({ tables, note: json.note });
    } catch {
      setFloorPlanError("Couldn't reach the AI service. Try again in a moment.");
    } finally {
      setFloorPlanSuggesting(false);
    }
  }

  function applyFloorPlanSuggestion() {
    if (!floorPlanSuggestion) return;
    setTableGroups(floorPlanSuggestion.tables);
    setFloorPlanSuggestion(null);
  }

  const MENU_MAX_BYTES = 20 * 1024 * 1024;
  const MENU_ALLOWED_EXT = new Set(["pdf", "docx", "xlsx", "xls", "csv"]);

  // Uploads a caterer's menu doc, has Claude group the dishes into courses (Starter,
  // Main, Dessert, etc.) and merges those into the planner's course list — matching
  // an existing course by name (case-insensitively) adds to its options instead of
  // creating a duplicate. The file itself is only a means to that list, so it's
  // deleted from storage right after.
  async function handleMenuUpload(file: File) {
    if (readOnly) return;
    setMenuError(null);
    setMenuNote(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!MENU_ALLOWED_EXT.has(ext)) {
      setMenuError("Upload a PDF, Word (.docx), or spreadsheet (.xlsx/.xls/.csv) file.");
      return;
    }
    if (file.size > MENU_MAX_BYTES) {
      setMenuError("That file is too large — keep it under 20MB.");
      return;
    }
    const path = `events/${eventId}/${crypto.randomUUID()}.${ext}`;
    setMenuUploading(true);
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("menus")
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) {
      setMenuUploading(false);
      setMenuError(`Couldn't upload that file: ${uploadError.message}`);
      return;
    }
    try {
      const res = await fetch("/api/menu/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, path }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMenuError(json.error || "Couldn't read that menu file.");
        return;
      }
      const found: { name: string; options: string[] }[] = json.courses || [];
      const totalOptions = found.reduce((n, c) => n + c.options.length, 0);
      if (found.length === 0 || totalOptions === 0) {
        setMenuError(json.note || "Couldn't find any menu options in that file.");
        return;
      }
      setCourses((prev) => {
        const next = [...prev];
        for (const ec of found) {
          const idx = next.findIndex((c) => c.name.trim().toLowerCase() === ec.name.trim().toLowerCase());
          if (idx >= 0) {
            const seen = new Set(next[idx].options.map((o) => o.toLowerCase()));
            const merged = [...next[idx].options];
            for (const o of ec.options) {
              if (!seen.has(o.toLowerCase())) {
                seen.add(o.toLowerCase());
                merged.push(o);
              }
            }
            next[idx] = { ...next[idx], options: merged };
          } else {
            next.push({ id: genId(), name: ec.name, options: ec.options });
          }
        }
        return next;
      });
      setMenuNote(
        json.note ||
          `Added ${totalOptions} option${totalOptions === 1 ? "" : "s"} across ${found.length} course${found.length === 1 ? "" : "s"} from ${file.name}.`
      );
    } catch {
      setMenuError("Couldn't reach the AI service. Try again in a moment.");
    } finally {
      setMenuUploading(false);
      await supabase.storage.from("menus").remove([path]);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bytes = new Uint8Array(evt.target?.result as ArrayBuffer);
        // Decide CSV vs. spreadsheet from the file's contents, not just its name:
        // phones and messaging apps often drop or change the ".csv" extension, and a
        // CSV sent down the spreadsheet path gets its accents mangled ("Inès" → "InÃ¨s").
        // Real .xlsx files are zip archives ("PK"), old .xls files start with D0 CF 11 E0.
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
        const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
        if (!isZip && !isOle) {
          // UTF-8 first (what Google Sheets, Numbers and most apps export); if the bytes
          // aren't valid UTF-8, it's an older Excel-on-Windows export, so fall back to that.
          let text: string;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            text = new TextDecoder("windows-1252").decode(bytes);
          }
          const result = Papa.parse(text.replace(/^\uFEFF/, ""), { skipEmptyLines: true });
          finishParse(result.data as unknown[][]);
        } else {
          const wb = XLSX.read(bytes, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
          finishParse(raw);
        }
      } catch {
        setImportError("Couldn't read that file. Make sure it's a .xlsx, .xls, or .csv file.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function confirmImport(mode: "add" | "replace" | "sync") {
    if (readOnly || !pendingImport) return;
    const existingByName: Record<string, string> = {};
    groups.forEach((g) => (existingByName[g.name.trim().toLowerCase()] = g.id));
    const newGroups: Group[] = [];
    pendingImport.groupNames.forEach((name) => {
      const key = name.trim().toLowerCase();
      if (!existingByName[key]) {
        const ng = { id: genId(), name, color: GROUP_COLORS[(groups.length + newGroups.length) % GROUP_COLORS.length] };
        newGroups.push(ng);
        existingByName[key] = ng.id;
      }
    });
    const resolveGroupIds = (groupNames: string[]) =>
      groupNames.map((gn) => existingByName[gn.trim().toLowerCase()]).filter(Boolean);

    setGroups((gs) => [...gs, ...newGroups]);

    if (mode === "sync") {
      const byEmail: Record<string, Guest> = {};
      const byName: Record<string, Guest> = {};
      guests.forEach((g) => {
        if (g.email) byEmail[g.email.trim().toLowerCase()] = g;
        byName[g.name.trim().toLowerCase()] = g;
      });

      const newlyDeclinedIds = new Set<string>();
      const newGuests: Guest[] = [];
      const updatesById: Record<string, Partial<Guest>> = {};

      pendingImport.guests.forEach((row) => {
        const matched = (row.email && byEmail[row.email]) || byName[row.name.trim().toLowerCase()];
        const rowGroupIds = resolveGroupIds(row.groupNames);
        if (matched) {
          const patch: Partial<Guest> = { ...(updatesById[matched.id] || {}) };
          if (row.email) patch.email = row.email;
          if (row.rsvpStatus) patch.rsvpStatus = row.rsvpStatus;
          if (row.mealChoice) patch.mealChoice = row.mealChoice;
          if (rowGroupIds.length) {
            patch.groupIds = [...new Set([...(matched.groupIds || []), ...rowGroupIds])];
          }
          updatesById[matched.id] = patch;
          if (row.rsvpStatus === "declined") newlyDeclinedIds.add(matched.id);
        } else {
          newGuests.push({
            id: genId(),
            name: row.name,
            groupIds: rowGroupIds,
            email: row.email,
            rsvpStatus: row.rsvpStatus,
            mealChoice: row.mealChoice,
          });
        }
      });

      setGuests((gs) => [...gs.map((g) => (updatesById[g.id] ? { ...g, ...updatesById[g.id] } : g)), ...newGuests]);

      if (newlyDeclinedIds.size > 0) {
        setSeatAssignment((prev) => {
          const next: SeatAssignment = {};
          for (const [seatId, guestId] of Object.entries(prev)) {
            if (!newlyDeclinedIds.has(guestId)) next[seatId] = guestId;
          }
          return next;
        });
      }

      const updatedCount = Object.keys(updatesById).length;
      setImportSuccess(
        `Synced ${pendingImport.guests.length} guest${pendingImport.guests.length === 1 ? "" : "s"}: ` +
          `${updatedCount} updated, ${newGuests.length} new` +
          (newGroups.length ? `, ${newGroups.length} group${newGroups.length === 1 ? "" : "s"} created` : "") +
          (newlyDeclinedIds.size > 0
            ? `. Freed the seat${newlyDeclinedIds.size === 1 ? "" : "s"} for ${newlyDeclinedIds.size} guest${newlyDeclinedIds.size === 1 ? "" : "s"} who declined.`
            : ".")
      );
      setPendingImport(null);
      logImport(pendingImport.guests.length, "sync", pendingImport.withRsvpData > 0, pendingImport.withMealData > 0);
      return;
    }

    const importedGuests: Guest[] = pendingImport.guests.map((g) => ({
      id: genId(),
      name: g.name,
      groupIds: resolveGroupIds(g.groupNames),
      email: g.email,
      rsvpStatus: g.rsvpStatus,
      mealChoice: g.mealChoice,
    }));
    setGuests((gs) => (mode === "replace" ? importedGuests : [...gs, ...importedGuests]));
    const declined = pendingImport.declinedCount;
    setImportSuccess(
      `Imported ${importedGuests.length} guest${importedGuests.length === 1 ? "" : "s"}` +
        (newGroups.length ? ` and created ${newGroups.length} group${newGroups.length === 1 ? "" : "s"}.` : ".") +
        (declined > 0 ? ` ${declined} marked as declined.` : "")
    );
    setPendingImport(null);
    logImport(pendingImport.guests.length, mode, pendingImport.withRsvpData > 0, pendingImport.withMealData > 0);
  }

  // ---- group handlers ----
  const addGroup = () => {
    if (readOnly) return;
    setGroups((gs) => [...gs, { id: genId(), name: `Group ${gs.length + 1}`, color: GROUP_COLORS[gs.length % GROUP_COLORS.length] }]);
  };
  const renameGroup = (id: string, name: string) => {
    if (readOnly) return;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name } : g)));
  };
  const removeGroup = (id: string) => {
    if (readOnly) return;
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setGuests((gs) => gs.map((g) => ({ ...g, groupIds: g.groupIds.filter((gid) => gid !== id) })));
    setConstraints((cs) => cs.filter((c) => !((c.aType === "group" && c.aId === id) || (c.bType === "group" && c.bId === id))));
  };
  const removeGroupWithUndo = (id: string) => {
    if (readOnly) return;
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    const prevGroups = groups;
    const prevGuests = guests;
    const prevConstraints = constraints;
    removeGroup(id);
    pushUndo(`Removed group "${group.name}".`, () => {
      setGroups(prevGroups);
      setGuests(prevGuests);
      setConstraints(prevConstraints);
    });
  };
  const toggleGroupSeatingMode = (id: string) => {
    if (readOnly) return;
    setGroups((gs) =>
      gs.map((g) => (g.id === id ? { ...g, seatingMode: g.seatingMode === "mixed" ? "together" : "mixed" } : g))
    );
  };

  // ---- constraint handlers ----
  // Rules are added directly from a guest's row (their side is always "this
  // guest"); the other side can still be a whole group, same as before.
  const addConstraintFor = (guestId: string, type: RuleType, bType: "guest" | "group", bId: string) => {
    if (readOnly || !bId) return;
    setConstraints((c) => [...c, { id: genId(), aType: "guest", aId: guestId, bType, bId, type }]);
  };
  const addGroupConstraint = (aId: string, bId: string, type: RuleType) => {
    if (readOnly || !aId || !bId || aId === bId) return;
    setConstraints((c) => [...c, { id: genId(), aType: "group", aId, bType: "group", bId, type }]);
  };
  const removeConstraint = (id: string) => {
    if (readOnly) return;
    setConstraints((c) => c.filter((x) => x.id !== id));
  };
  const removeConstraintWithUndo = (id: string) => {
    if (readOnly) return;
    const prevConstraints = constraints;
    removeConstraint(id);
    pushUndo("Removed rule.", () => setConstraints(prevConstraints));
  };

  // ---- seating handlers ----
  const assignGuestToSeat = useCallback(
    (guestId: string, targetSeatId: string) => {
      if (readOnly) return;
      setJustGenerated(false);
      setSeatAssignment((prev) => {
        const next = { ...prev };
        const fromSeatId = Object.keys(prev).find((sid) => prev[sid] === guestId);
        const occupant = next[targetSeatId] || null;
        if (fromSeatId) delete next[fromSeatId];
        next[targetSeatId] = guestId;
        if (occupant && occupant !== guestId && fromSeatId) {
          next[fromSeatId] = occupant;
        }
        return next;
      });
    },
    [readOnly]
  );

  const clearSeat = (seatId: string) => {
    if (readOnly) return;
    setJustGenerated(false);
    setSeatAssignment((prev) => {
      const next = { ...prev };
      delete next[seatId];
      return next;
    });
  };

  function handleSeatClick(seatId: string) {
    if (readOnly) return;
    const occupant = seatAssignment[seatId] || null;
    if (picked) {
      if (picked !== occupant) assignGuestToSeat(picked, seatId);
      setPicked(null);
    } else if (occupant) {
      setPicked(occupant);
    }
  }

  function handlePoolClick(guestId: string) {
    if (readOnly) return;
    if (picked === guestId) setPicked(null);
    else setPicked(guestId);
  }

  function handleDragStart(e: React.DragEvent, guestId: string) {
    if (readOnly) return;
    e.dataTransfer.setData("text/plain", guestId);
  }
  function handleDrop(e: React.DragEvent, seatId: string) {
    e.preventDefault();
    if (readOnly) return;
    const guestId = e.dataTransfer.getData("text/plain");
    if (guestId) assignGuestToSeat(guestId, seatId);
    setPicked(null);
  }

  function clearAllSeats() {
    if (readOnly) return;
    setSeatAssignment({});
    setHiddenTableIds([]);
    setJustGenerated(false);
    setPicked(null);
  }
  function clearAllSeatsWithUndo() {
    if (readOnly || seatedCount === 0) return;
    const prevSeatAssignment = seatAssignment;
    const prevHiddenTableIds = hiddenTableIds;
    const prevJustGenerated = justGenerated;
    clearAllSeats();
    pushUndo("Cleared all seats.", () => {
      setSeatAssignment(prevSeatAssignment);
      setHiddenTableIds(prevHiddenTableIds);
      setJustGenerated(prevJustGenerated);
    });
  }

  // `forceReshuffle` is for the dedicated "Shuffle seating" action — a full
  // re-solve from scratch regardless of the "keep close to current plan"
  // checkbox, for when a plan already exists and the ask is specifically
  // "give me a different arrangement," not "regenerate respecting my setting."
  function runSolver(forceReshuffle = false) {
    if (readOnly) return;
    if (totalSeats < guests.length) return;
    setSolving(true);
    setTimeout(() => {
      let poolTables = tables;
      let chosenIds = tables.map((t) => t.id);
      if (fillMode === "consolidate") {
        chosenIds = pickConsolidatedTables(tables, guests.length);
        poolTables = tables.filter((t) => chosenIds.includes(t.id));
      }
      const poolSeats = buildSeats(poolTables);
      const poolSeatsById = Object.fromEntries(poolSeats.map((s) => [s.id, s]));
      const result = solveSeating(
        poolSeats,
        guests.map((g) => g.id),
        flatPairs,
        poolSeatsById,
        fillMode,
        !forceReshuffle && minimizeChanges ? seatAssignment : {},
        autoGroupPairs
      );
      setSeatAssignment(result);
      setHiddenTableIds(tables.filter((t) => !chosenIds.includes(t.id)).map((t) => t.id));
      setShowAllTables(false);
      setSolving(false);
      setJustGenerated(true);
    }, 40);
  }

  // ---- export handlers ----
  function safeFileName() {
    return eventName.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Event";
  }

  function exportExcel() {
    const rows: (string | number)[][] = [["Table", "Seat", "Guest"]];
    visibleTables.forEach((t) => {
      for (let i = 0; i < t.capacity; i++) {
        const seatId = `${t.id}#${i}`;
        const guestId = seatAssignment[seatId];
        const guestName = guestId ? guestById[guestId]?.name || "" : "";
        rows.push([t.label, i + 1, guestName || "— empty —"]);
      }
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Seating");
    XLSX.writeFile(wb, `${safeFileName()} - Seating List.xlsx`);
  }

  // Designed, print-ready seating chart poster — a table-by-table guest
  // listing (like a printed sign for the venue entrance), not a floor-plan
  // diagram. Renders its own hidden DOM (independent of the interactive map
  // canvas, so it works from either Map or Table view) styled per the chosen
  // layout/palette/font combination, then rasterizes it with html2canvas —
  // same approach the old floor-plan PDF export used, just pointed at new,
  // purpose-built markup. Layout (clean vs. flourish) controls structure and
  // ornamentation; palette and font are pure color/type swaps on top of it —
  // that separation is what lets the three be picked independently.
  async function exportPosterPdf() {
    setExportingPdf(true);
    const layout = getPosterLayout(posterLayout);
    const palette = getPosterPalette(posterPalette);
    const font = getPosterFont(posterFont);
    const container = document.createElement("div");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

      const tableBlocks = visibleTables
        .map((t) => {
          const names: string[] = [];
          for (let i = 0; i < t.capacity; i++) {
            const guestId = seatAssignment[`${t.id}#${i}`];
            const g = guestId ? guestById[guestId] : null;
            if (g) names.push(g.name);
          }
          return { label: t.label, names };
        })
        .filter((b) => b.names.length > 0);

      const seatedIds = new Set(Object.values(seatAssignment).filter(Boolean));
      const unseated = guests
        .filter((g) => !seatedIds.has(g.id) && g.rsvpStatus !== "declined")
        .map((g) => g.name);

      const dateLocation = [eventDate ? formatPosterDate(eventDate) : null, location || null]
        .filter(Boolean)
        .join(" · ");

      const flourish = layout.flourish;
      const headingStyle = `font-family:${font.headingFont}; font-weight:${font.headingWeight ?? 600}; font-style:${font.headingStyle ?? "normal"};`;

      // A small ornamental rule used only in the Flourish layout — plain
      // horizontal lines everywhere else (the Clean layout).
      const flourishRule = (color: string) => `
        <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin:12px 0;">
          <span style="flex:1; max-width:70px; height:1px; background:${color};"></span>
          <span style="font-size:15px; color:${color}; line-height:1;">&#10087;</span>
          <span style="flex:1; max-width:70px; height:1px; background:${color};"></span>
        </div>
      `;

      container.style.position = "fixed";
      container.style.left = "-99999px";
      container.style.top = "0";
      container.style.width = "900px";
      container.style.padding = flourish ? "40px" : "56px 64px";
      container.style.backgroundColor = palette.background;
      container.style.fontFamily = font.bodyFont;
      container.style.boxSizing = "border-box";

      const headerBlock = `
        <div style="text-align:center; margin-bottom:${flourish ? 32 : 40}px; ${
          flourish ? "" : `padding-bottom:28px; border-bottom: 1px solid ${palette.line};`
        }">
          <div style="font-size:11px; letter-spacing:0.25em; text-transform:uppercase; font-weight:600; color:${palette.accent}; margin-bottom:10px;">Seating Chart</div>
          <div style="${headingStyle} font-size:44px; color:${palette.ink}; line-height:1.15;">${escapeHtml(eventName)}</div>
          ${dateLocation ? `<div style="font-size:14px; color:${palette.muted}; margin-top:10px;">${escapeHtml(dateLocation)}</div>` : ""}
          ${flourish ? flourishRule(palette.accent) : ""}
        </div>
      `;

      const tablesBlock = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:32px 28px;">
          ${tableBlocks
            .map(
              (b) => `
            <div style="${flourish ? `border: 1px solid ${palette.line}; border-radius:10px; padding:16px 18px;` : ""}">
              <div style="${headingStyle} font-size:16px; letter-spacing:0.04em; text-transform:${
                flourish ? "none" : "uppercase"
              }; color:${palette.accent}; margin-bottom:10px; ${
                flourish ? "" : `padding-bottom:6px; border-bottom: 1.5px solid ${palette.line};`
              }">${escapeHtml(b.label)}</div>
              <div style="font-size:14px; color:${palette.ink}; line-height:1.9;">${b.names.map((n) => escapeHtml(n)).join("<br/>")}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;

      const unseatedBlock =
        unseated.length > 0
          ? `<div style="margin-top:${flourish ? 32 : 40}px; padding-top:20px; ${
              flourish ? "" : `border-top: 1px solid ${palette.line};`
            }">
              ${flourish ? flourishRule(palette.line) : ""}
              <div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:${palette.muted}; margin-bottom:8px; text-align:${flourish ? "center" : "left"};">Not yet seated</div>
              <div style="font-size:13px; color:${palette.muted}; text-align:${flourish ? "center" : "left"};">${unseated.map((n) => escapeHtml(n)).join(", ")}</div>
            </div>`
          : "";

      container.innerHTML = flourish
        ? `<div style="border: 2px solid ${palette.accent}; border-radius:4px; padding:36px;">
             <div style="border: 1px solid ${palette.line}; border-radius:2px; padding:28px;">
               ${headerBlock}${tablesBlock}${unseatedBlock}
             </div>
           </div>`
        : `${headerBlock}${tablesBlock}${unseatedBlock}`;

      document.body.appendChild(container);
      const canvas = await html2canvas(container, { backgroundColor: palette.background, scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "pt", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${safeFileName()} - Seating Chart.pdf`);
    } catch (e) {
      console.error("Poster export failed:", e);
      window.alert(`Couldn't generate the seating chart: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (container.parentNode) container.parentNode.removeChild(container);
      setExportingPdf(false);
    }
  }

  // ---- conversational agent: apply a batch of proposed operations ----
  function applyAgentOperations(operations: AgentOperation[]): AgentApplyResult[] {
    if (readOnly) {
      return operations.map((_, index) => ({ index, ok: false, message: "You don't have edit access." }));
    }

    // Snapshot for Undo — the assistant now applies changes immediately (no
    // propose-then-confirm step), so this is the only safety net.
    const prevGuests = guests;
    const prevGroups = groups;
    const prevTableGroups = tableGroups;
    const prevConstraints = constraints;
    const prevSeatAssignment = seatAssignment;

    let workingGuests = guests.map((g) => ({ ...g, groupIds: [...g.groupIds] }));
    let workingGroups = groups.map((g) => ({ ...g }));
    let workingTableGroups = tableGroups.map((tg) => ({ ...tg }));
    let workingConstraints = constraints.map((c) => ({ ...c }));
    let workingSeatAssignment: SeatAssignment = { ...seatAssignment };

    function byName<T>(list: T[], nameOf: (x: T) => string, name: string): T | undefined {
      const key = (name || "").trim().toLowerCase();
      if (!key) return undefined;
      return (
        list.find((x) => nameOf(x).trim().toLowerCase() === key) ||
        list.find((x) => nameOf(x).trim().toLowerCase().includes(key))
      );
    }
    const findGuest = (name?: string) => byName(workingGuests, (g) => g.name, name || "");
    const findGroup = (name?: string) => byName(workingGroups, (g) => g.name, name || "");
    const findTableGroup = (label?: string) => byName(workingTableGroups, (t) => t.label, label || "");
    const ensureGroupIds = (names: string[] | undefined) => {
      const ids: string[] = [];
      (names || []).forEach((gn) => {
        let g = findGroup(gn);
        if (!g) {
          g = { id: genId(), name: gn.trim(), color: GROUP_COLORS[workingGroups.length % GROUP_COLORS.length] };
          workingGroups = [...workingGroups, g];
        }
        ids.push(g.id);
      });
      return ids;
    };

    const results: AgentApplyResult[] = [];

    // A new or removed rule only takes effect when the solver runs again. The
    // assistant doesn't always ask for that, so if it changed a rule on a plan
    // that already has people seated, re-run the solver at the end of the batch.
    // (Appended last, so result indices still line up with the checklist shown.)
    const RULE_OPS: AgentOperationType[] = ["add_constraint", "remove_constraint", "set_group_seating_mode"];
    const autoRegenerate =
      operations.some((op) => RULE_OPS.includes(op.type)) &&
      !operations.some((op) => op.type === "regenerate_plan" || op.type === "clear_seating") &&
      Object.keys(seatAssignment).length > 0;
    const opsToApply: AgentOperation[] = autoRegenerate ? [...operations, { type: "regenerate_plan" }] : operations;

    // Guests this batch explicitly placed (seat_guest) → the seats they're allowed
    // in. A later regenerate_plan in the same batch keeps them there, so "keep A
    // and B at the head table but not next to each other" can't get undone by
    // the solver pulling them back toward their group's table.
    const pinnedSeatsOfGuest: Record<string, string[]> = {};

    opsToApply.forEach((op, index) => {
      // Optional detail shown under a step that succeeded (e.g. who was picked).
      let note: string | undefined;
      try {
        switch (op.type) {
          case "add_guest": {
            const name = (op.name || "").trim();
            if (!name) throw new Error("Missing name.");
            workingGuests = [...workingGuests, { id: genId(), name, groupIds: ensureGroupIds(op.groupNames) }];
            break;
          }
          case "remove_guest": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            workingGuests = workingGuests.filter((x) => x.id !== g.id);
            workingConstraints = workingConstraints.filter(
              (c) => !((c.aType === "guest" && c.aId === g.id) || (c.bType === "guest" && c.bId === g.id))
            );
            workingSeatAssignment = Object.fromEntries(
              Object.entries(workingSeatAssignment).filter(([, guestId]) => guestId !== g.id)
            );
            break;
          }
          case "rename_guest": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            if (!op.newName?.trim()) throw new Error("Missing new name.");
            workingGuests = workingGuests.map((x) => (x.id === g.id ? { ...x, name: op.newName!.trim() } : x));
            break;
          }
          case "set_guest_groups": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            const groupIds = ensureGroupIds(op.groupNames);
            workingGuests = workingGuests.map((x) => (x.id === g.id ? { ...x, groupIds } : x));
            break;
          }
          case "set_guest_note": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            workingGuests = workingGuests.map((x) => (x.id === g.id ? { ...x, note: op.note ?? "" } : x));
            break;
          }
          case "set_guest_rsvp_status": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            if (!op.rsvpStatus) throw new Error("Missing RSVP status.");
            workingGuests = workingGuests.map((x) => (x.id === g.id ? { ...x, rsvpStatus: op.rsvpStatus } : x));
            if (op.rsvpStatus === "declined") {
              const next = { ...workingSeatAssignment };
              const fromSeatId = Object.keys(next).find((sid) => next[sid] === g.id);
              if (fromSeatId) delete next[fromSeatId];
              workingSeatAssignment = next;
            }
            break;
          }
          case "set_guest_meal_choice": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            workingGuests = workingGuests.map((x) => (x.id === g.id ? { ...x, mealChoice: op.mealChoice ?? "" } : x));
            break;
          }
          case "add_group": {
            const name = (op.name || "").trim();
            if (!name) throw new Error("Missing name.");
            if (findGroup(name)) throw new Error(`Group "${name}" already exists.`);
            workingGroups = [...workingGroups, { id: genId(), name, color: GROUP_COLORS[workingGroups.length % GROUP_COLORS.length] }];
            break;
          }
          case "rename_group": {
            const g = findGroup(op.groupName);
            if (!g) throw new Error(`Couldn't find group "${op.groupName}".`);
            if (!op.newName?.trim()) throw new Error("Missing new name.");
            workingGroups = workingGroups.map((x) => (x.id === g.id ? { ...x, name: op.newName!.trim() } : x));
            break;
          }
          case "remove_group": {
            const g = findGroup(op.groupName);
            if (!g) throw new Error(`Couldn't find group "${op.groupName}".`);
            workingGroups = workingGroups.filter((x) => x.id !== g.id);
            workingGuests = workingGuests.map((x) => ({ ...x, groupIds: x.groupIds.filter((gid) => gid !== g.id) }));
            workingConstraints = workingConstraints.filter(
              (c) => !((c.aType === "group" && c.aId === g.id) || (c.bType === "group" && c.bId === g.id))
            );
            break;
          }
          case "add_table_group": {
            const label = (op.tableGroupLabel || "").trim();
            if (!label) throw new Error("Missing table type label.");
            const count = Number(op.count) > 0 ? Number(op.count) : 1;
            const capacity = Number(op.capacity) > 0 ? Number(op.capacity) : 8;
            workingTableGroups = [...workingTableGroups, { id: genId(), label, count, capacity }];
            break;
          }
          case "update_table_group": {
            const tg = findTableGroup(op.tableGroupLabel);
            if (!tg) throw new Error(`Couldn't find table type "${op.tableGroupLabel}".`);
            const patch: Partial<TableGroup> = {};
            if (op.newTableGroupLabel?.trim()) patch.label = op.newTableGroupLabel.trim();
            if (op.count !== undefined) patch.count = Number(op.count);
            if (op.capacity !== undefined) patch.capacity = Number(op.capacity);
            workingTableGroups = workingTableGroups.map((x) => (x.id === tg.id ? { ...x, ...patch } : x));
            break;
          }
          case "remove_table_group": {
            const tg = findTableGroup(op.tableGroupLabel);
            if (!tg) throw new Error(`Couldn't find table type "${op.tableGroupLabel}".`);
            const removedTableIds = new Set(buildTables([tg]).map((t) => t.id));
            workingTableGroups = workingTableGroups.filter((x) => x.id !== tg.id);
            workingSeatAssignment = Object.fromEntries(
              Object.entries(workingSeatAssignment).filter(([seatId]) => !removedTableIds.has(seatId.split("#")[0]))
            );
            break;
          }
          case "seat_guest": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            const table = byName(
              buildTables(workingTableGroups, tableNameOverrides).filter((t) => !deletedTableSet.has(t.id)),
              (t) => t.label,
              op.tableLabel || ""
            );
            if (!table) throw new Error(`Couldn't find table "${op.tableLabel}".`);
            const next = { ...workingSeatAssignment };
            const fromSeatId = Object.keys(next).find((sid) => next[sid] === g.id);
            const position = op.seatPosition === "head" || op.seatPosition === "foot" ? op.seatPosition : null;

            if (!position) {
              pinnedSeatsOfGuest[g.id] = buildSeats([table]).map((s) => s.id);
              // Already at this table → nothing to move.
              if (fromSeatId && fromSeatId.split("#")[0] === table.id) break;
              const occupied = new Set(Object.keys(next));
              const freeSeat = buildSeats([table]).find((s) => !occupied.has(s.id));
              if (!freeSeat) throw new Error(`"${table.label}" is full.`);
              if (fromSeatId) delete next[fromSeatId];
              next[freeSeat.id] = g.id;
              workingSeatAssignment = next;
              break;
            }

            // Head/foot: only square and rectangle tables have short ends.
            if (table.shape !== "square" && table.shape !== "rectangle") {
              throw new Error(`"${table.label}" is ${table.shape} — only square and rectangle tables have a ${position}.`);
            }
            const roles = rectSeatRoles(table.capacity, table.headCount, table.footCount);
            const targetIdxs = position === "head" ? roles.headIdxs : roles.footIdxs;
            if (targetIdxs.length === 0) throw new Error(`"${table.label}" has no seat at the ${position}.`);
            const targetSeatIds = targetIdxs.map((i) => `${table.id}#${i}`);
            pinnedSeatsOfGuest[g.id] = targetSeatIds;
            if (fromSeatId && targetSeatIds.includes(fromSeatId)) break; // already there

            // Prefer a free head/foot seat; otherwise take the first one and move its occupant.
            const targetSeatId = targetSeatIds.find((sid) => !next[sid]) ?? targetSeatIds[0];
            const occupantId = next[targetSeatId];
            if (fromSeatId) delete next[fromSeatId];
            next[targetSeatId] = g.id;
            if (occupantId) {
              if (fromSeatId) {
                // Straight swap: whoever had the seat takes the guest's old seat.
                next[fromSeatId] = occupantId;
              } else {
                // Guest wasn't seated — bump the occupant to another free seat, same table first.
                const taken = new Set(Object.keys(next));
                const allSeats = buildSeats(
                  buildTables(workingTableGroups, tableNameOverrides).filter((t) => !deletedTableSet.has(t.id))
                );
                const spare =
                  allSeats.find((s) => s.tableId === table.id && !taken.has(s.id)) || allSeats.find((s) => !taken.has(s.id));
                if (!spare) throw new Error(`No free seat to move ${workingGuests.find((x) => x.id === occupantId)?.name ?? "the current occupant"} to.`);
                next[spare.id] = occupantId;
              }
            }
            workingSeatAssignment = next;
            break;
          }
          case "move_group_off_table": {
            const grp = findGroup(op.groupName);
            if (!grp) throw new Error(`Couldn't find group "${op.groupName}".`);
            const liveTables = buildTables(workingTableGroups, tableNameOverrides).filter((t) => !deletedTableSet.has(t.id));
            const table = byName(liveTables, (t) => t.label, op.tableLabel || "");
            if (!table) throw new Error(`Couldn't find table "${op.tableLabel}".`);
            const isMember = (gid: string) => !!workingGuests.find((x) => x.id === gid)?.groupIds.includes(grp.id);
            const next = { ...workingSeatAssignment };
            const leaving = Object.keys(next).filter((sid) => sid.split("#")[0] === table.id && isMember(next[sid]));
            if (leaving.length === 0) throw new Error(`Nobody from "${grp.name}" is at ${table.label}.`);
            // Free seats at other tables, best first: tables where this group already
            // sits (so it stays together), then the emptiest tables.
            const occupied = new Set(Object.keys(next));
            const otherTables = liveTables.filter((t) => t.id !== table.id);
            const membersAt = (tid: string) => Object.keys(next).filter((sid) => sid.split("#")[0] === tid && isMember(next[sid])).length;
            const freeAt = (t: Table) => buildSeats([t]).filter((s) => !occupied.has(s.id));
            const ranked = otherTables
              .map((t) => ({ t, members: membersAt(t.id), free: freeAt(t) }))
              .filter((x) => x.free.length > 0)
              .sort((a, b) => b.members - a.members || b.free.length - a.free.length);
            const destSeats = ranked.flatMap((x) => x.free);
            if (destSeats.length < leaving.length) {
              throw new Error(`Only ${destSeats.length} free seat${destSeats.length === 1 ? "" : "s"} at other tables for ${leaving.length} guests — add a table first.`);
            }
            leaving.forEach((sid, k) => {
              const gid = next[sid];
              delete next[sid];
              next[destSeats[k].id] = gid;
              pinnedSeatsOfGuest[gid] = otherTables.flatMap((t) => buildSeats([t]).map((s) => s.id));
            });
            workingSeatAssignment = next;
            const usedTables = [...new Set(destSeats.slice(0, leaving.length).map((s) => liveTables.find((t) => t.id === s.tableId)?.label))];
            note = `Moved ${leaving.length} to ${usedTables.join(", ")}`;
            break;
          }
          case "fill_table_from_groups": {
            const liveTables = buildTables(workingTableGroups, tableNameOverrides).filter((t) => !deletedTableSet.has(t.id));
            const table = byName(liveTables, (t) => t.label, op.tableLabel || "");
            if (!table) throw new Error(`Couldn't find table "${op.tableLabel}".`);
            const picks = (op.picks || []).filter((p) => p && p.groupName && Number(p.count) > 0);
            if (picks.length === 0) throw new Error("No groups to pick from.");
            const next = { ...workingSeatAssignment };
            const tableSeatIds = buildSeats([table]).map((s) => s.id);
            const freeSeats = tableSeatIds.filter((sid) => !next[sid]);
            const atTable = new Set(tableSeatIds.map((sid) => next[sid]).filter(Boolean));
            const wanted = picks.reduce((n, p) => n + Number(p.count), 0);
            if (freeSeats.length < wanted) {
              throw new Error(`${table.label} has ${freeSeats.length} free seat${freeSeats.length === 1 ? "" : "s"} but ${wanted} were requested — move someone off it first.`);
            }
            const chosen: string[] = [];
            const summary: string[] = [];
            for (const p of picks) {
              const grp = findGroup(p.groupName);
              if (!grp) throw new Error(`Couldn't find group "${p.groupName}".`);
              // Random members of this group who aren't already at the table, aren't
              // declined, and weren't placed somewhere specific earlier in this request.
              const pool = workingGuests.filter(
                (x) =>
                  x.groupIds.includes(grp.id) &&
                  x.rsvpStatus !== "declined" &&
                  !atTable.has(x.id) &&
                  !chosen.includes(x.id) &&
                  !pinnedSeatsOfGuest[x.id]
              );
              for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
              }
              const take = pool.slice(0, Number(p.count));
              if (take.length < Number(p.count)) {
                throw new Error(`"${grp.name}" only has ${take.length} guest${take.length === 1 ? "" : "s"} available for ${table.label}.`);
              }
              chosen.push(...take.map((x) => x.id));
              summary.push(`${grp.name}: ${take.map((x) => x.name).join(", ")}`);
            }
            chosen.forEach((gid, k) => {
              const fromSeatId = Object.keys(next).find((sid) => next[sid] === gid);
              if (fromSeatId) delete next[fromSeatId];
              next[freeSeats[k]] = gid;
              pinnedSeatsOfGuest[gid] = tableSeatIds;
            });
            workingSeatAssignment = next;
            note = summary.join(" · ");
            break;
          }
          case "unseat_guest": {
            const g = findGuest(op.guestName);
            if (!g) throw new Error(`Couldn't find guest "${op.guestName}".`);
            const next = { ...workingSeatAssignment };
            const fromSeatId = Object.keys(next).find((sid) => next[sid] === g.id);
            if (!fromSeatId) throw new Error(`"${g.name}" isn't currently seated.`);
            delete next[fromSeatId];
            workingSeatAssignment = next;
            break;
          }
          case "swap_guests": {
            const a = findGuest(op.guestNameA);
            const b = findGuest(op.guestNameB);
            if (!a || !b) throw new Error("Couldn't find one or both guests.");
            const seatA = Object.keys(workingSeatAssignment).find((sid) => workingSeatAssignment[sid] === a.id);
            const seatB = Object.keys(workingSeatAssignment).find((sid) => workingSeatAssignment[sid] === b.id);
            if (!seatA || !seatB) throw new Error("Both guests need to already be seated to swap.");
            const next = { ...workingSeatAssignment };
            next[seatA] = b.id;
            next[seatB] = a.id;
            workingSeatAssignment = next;
            break;
          }
          case "clear_seating": {
            workingSeatAssignment = {};
            setHiddenTableIds([]);
            setJustGenerated(false);
            break;
          }
          case "set_group_seating_mode": {
            const g = findGroup(op.groupName);
            if (!g) throw new Error(`Couldn't find group "${op.groupName}".`);
            if (op.seatingMode !== "together" && op.seatingMode !== "mixed") throw new Error("Missing seating mode.");
            workingGroups = workingGroups.map((x) => (x.id === g.id ? { ...x, seatingMode: op.seatingMode } : x));
            break;
          }
          case "add_constraint": {
            const aType: "guest" | "group" = op.aType === "group" ? "group" : "guest";
            const bType: "guest" | "group" = op.bType === "group" ? "group" : "guest";
            const aEntity = aType === "group" ? findGroup(op.aName) : findGuest(op.aName);
            const bEntity = bType === "group" ? findGroup(op.bName) : findGuest(op.bName);
            if (!aEntity || !bEntity) throw new Error(`Couldn't find "${op.aName}" or "${op.bName}".`);
            workingConstraints = [
              ...workingConstraints,
              {
                id: genId(),
                aType,
                aId: aEntity.id,
                bType,
                bId: bEntity.id,
                type: op.constraintType === "cannot" || op.constraintType === "notNextTo" ? op.constraintType : "must",
              },
            ];
            break;
          }
          case "remove_constraint": {
            const nameOf = (type: "guest" | "group", id: string) =>
              (type === "group" ? workingGroups.find((g) => g.id === id)?.name : workingGuests.find((g) => g.id === id)?.name) || "";
            const aKey = (op.aName || "").trim().toLowerCase();
            const bKey = (op.bName || "").trim().toLowerCase();
            const match = workingConstraints.find((c) => {
              const an = nameOf(c.aType, c.aId).trim().toLowerCase();
              const bn = nameOf(c.bType, c.bId).trim().toLowerCase();
              return (an === aKey && bn === bKey) || (an === bKey && bn === aKey);
            });
            if (!match) throw new Error(`Couldn't find a constraint between "${op.aName}" and "${op.bName}".`);
            workingConstraints = workingConstraints.filter((c) => c.id !== match.id);
            break;
          }
          case "regenerate_plan": {
            const workingTables = buildTables(workingTableGroups).filter((t) => !deletedTableSet.has(t.id));
            let poolTables = workingTables;
            // Only pins for guests still on the list, whose seats still exist.
            const pins: Record<string, string[]> = {};
            const workingGuestIds = new Set(workingGuests.map((g) => g.id));
            for (const [gid, sids] of Object.entries(pinnedSeatsOfGuest)) {
              if (workingGuestIds.has(gid)) pins[gid] = sids;
            }
            const pinnedTableIds = new Set(Object.values(pins).flatMap((sids) => sids.map((sid) => sid.split("#")[0])));
            if (fillMode === "consolidate") {
              const chosenIds = pickConsolidatedTables(workingTables, workingGuests.length);
              // A table someone was just pinned to always stays in play.
              poolTables = workingTables.filter((t) => chosenIds.includes(t.id) || pinnedTableIds.has(t.id));
            }
            const poolSeats = buildSeats(poolTables);
            if (poolSeats.length < workingGuests.length) throw new Error("Not enough seats for all guests.");
            const poolSeatsById = Object.fromEntries(poolSeats.map((s) => [s.id, s]));
            const workingGuestsByGroupId: Record<string, string[]> = {};
            workingGuests.forEach((g) =>
              (g.groupIds || []).forEach((gid) => (workingGuestsByGroupId[gid] = workingGuestsByGroupId[gid] || []).push(g.id))
            );
            const workingFlatPairs = expandAllConstraints(workingConstraints, workingGuestsByGroupId);
            const workingAutoGroupPairs = buildAutoGroupPairs(workingGroups, workingGuestsByGroupId);
            workingSeatAssignment = solveSeating(
              poolSeats,
              workingGuests.map((g) => g.id),
              workingFlatPairs,
              poolSeatsById,
              fillMode,
              // When the app re-runs the solver on its own after a rule change
              // (the user never asked for a reshuffle), always start from the
              // current plan so only what the new rule needs actually moves.
              minimizeChanges || autoRegenerate ? workingSeatAssignment : {},
              workingAutoGroupPairs,
              pins
            );
            {
              const poolIds = new Set(poolTables.map((t) => t.id));
              setHiddenTableIds(workingTables.filter((t) => !poolIds.has(t.id)).map((t) => t.id));
            }
            setShowAllTables(false);
            setJustGenerated(true);
            break;
          }
          default:
            throw new Error("Unknown operation.");
        }
        results.push({ index, ok: true, ...(note ? { message: note } : {}) });
      } catch (e) {
        results.push({ index, ok: false, message: e instanceof Error ? e.message : "Failed." });
      }
    });

    setGuests(workingGuests);
    setGroups(workingGroups);
    setTableGroups(workingTableGroups);
    setConstraints(workingConstraints);
    setSeatAssignment(workingSeatAssignment);
    setPicked(null);

    const successCount = results.filter((r) => r.ok).length;

    if (successCount > 0) {
      pushUndo(`Applied ${successCount} AI-suggested change${successCount === 1 ? "" : "s"}.`, () => {
        setGuests(prevGuests);
        setGroups(prevGroups);
        setTableGroups(prevTableGroups);
        setConstraints(prevConstraints);
        setSeatAssignment(prevSeatAssignment);
      });
    }

    // Best-effort usage logging: one row per batch of agent-proposed changes the
    // user actually applied, so "agent vs. manual" usage can be answered later
    // (see admin report). Never let this affect the apply itself.
    if (successCount > 0) {
      const successTypes = Array.from(
        new Set(results.filter((r) => r.ok).map((r) => opsToApply[r.index]?.type).filter(Boolean))
      );
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(({ data: { user } }) => {
          if (!user) return;
          return supabase.from("agent_log").insert({
            event_id: eventId,
            user_id: user.id,
            operations_count: successCount,
            operation_types: successTypes,
          });
        })
        .catch(() => {});
    }

    return results;
  }

  const seatsShort = totalSeats < guests.length;
  const capacityExceeded = maxCapacity !== "" && activeGuests.length > Number(maxCapacity);

  const PANE_ORDER = [
    { id: "overview", label: "Overview" },
    { id: "setup", label: "Tables" },
    { id: "guests", label: "Guests & rules" },
    { id: "seating", label: "Seating map" },
    { id: "decor", label: "Decor ideas" },
  ] as const;
  const paneIndex = PANE_ORDER.findIndex((p) => p.id === tab);
  const prevPane = paneIndex > 0 ? PANE_ORDER[paneIndex - 1] : null;
  const nextPane = paneIndex >= 0 && paneIndex < PANE_ORDER.length - 1 ? PANE_ORDER[paneIndex + 1] : null;

  return {
    eventId,
    initialName,
    initialData,
    role,
    members,
    initialEventDate,
    initialLocation,
    initialMaxCapacity,
    initialRsvpEnabled,
    initialUpdatedAt,
    readOnly,
    eventName,
    setEventName,
    eventDate,
    setEventDate,
    location,
    setLocation,
    maxCapacity,
    setMaxCapacity,
    rsvpEnabled,
    setRsvpEnabled,
    router,
    pathname,
    searchParams,
    VALID_TABS,
    initialTabParam,
    tab,
    setTabState,
    setTab,
    tableGroups,
    setTableGroups,
    guests,
    setGuests,
    groups,
    setGroups,
    constraints,
    setConstraints,
    seatAssignment,
    setSeatAssignment,
    solving,
    setSolving,
    justGenerated,
    setJustGenerated,
    seatingView,
    setSeatingView,
    highlightNotes,
    setHighlightNotes,
    showGuestNames,
    setShowGuestNames,
    picked,
    setPicked,
    hoveredGuest,
    setHoveredGuest,
    newGuestName,
    setNewGuestName,
    fillMode,
    setFillMode,
    minimizeChanges,
    setMinimizeChanges,
    hiddenTableIds,
    setHiddenTableIds,
    hiddenTableSet,
    showAllTables,
    setShowAllTables,
    tableNameOverrides,
    setTableNameOverrides,
    tablePositions,
    setTablePositions,
    fixtures,
    setFixtures,
    tableRotations,
    setTableRotations,
    rotating,
    setRotating,
    fixturePositions,
    setFixturePositions,
    deletedTableIds,
    setDeletedTableIds,
    selectedTableId,
    setSelectedTableId,
    showRemovedTables,
    setShowRemovedTables,
    tableJustDragged,
    selectedFixtureId,
    setSelectedFixtureId,
    fixtureResize,
    setFixtureResize,
    sizeEditorId,
    setSizeEditorId,
    movingItem,
    setMovingItem,
    mapSearchOpen,
    setMapSearchOpen,
    mapSearchQuery,
    setMapSearchQuery,
    highlightSeatId,
    setHighlightSeatId,
    dragFixture,
    setDragFixture,
    floorPlan,
    setFloorPlan,
    legacyPoster,
    posterLayout,
    setPosterLayout,
    posterPalette,
    setPosterPalette,
    posterFont,
    setPosterFont,
    collectComments,
    setCollectComments,
    courses,
    setCourses,
    newCourseOption,
    setNewCourseOption,
    floorPlanUploading,
    setFloorPlanUploading,
    floorPlanError,
    setFloorPlanError,
    floorPlanSuggesting,
    setFloorPlanSuggesting,
    floorPlanSuggestion,
    setFloorPlanSuggestion,
    menuUploading,
    setMenuUploading,
    menuError,
    setMenuError,
    menuNote,
    setMenuNote,
    guestSearch,
    setGuestSearch,
    compactGuestRows,
    setCompactGuestRows,
    addRuleForGuestId,
    setAddRuleForGuestId,
    addRuleType,
    setAddRuleType,
    addRuleTargetType,
    setAddRuleTargetType,
    addRuleTargetId,
    setAddRuleTargetId,
    showGroupRuleForm,
    setShowGroupRuleForm,
    groupRuleType,
    setGroupRuleType,
    groupRuleAId,
    setGroupRuleAId,
    groupRuleBId,
    setGroupRuleBId,
    rsvpFilter,
    setRsvpFilter,
    undo,
    setUndo,
    undoTimerRef,
    exportMenuRef,
    dragTable,
    setDragTable,
    resizingGroupId,
    setResizingGroupId,
    resizePreviewScale,
    setResizePreviewScale,
    pendingImport,
    setPendingImport,
    importError,
    setImportError,
    importSuccess,
    setImportSuccess,
    showImportHelp,
    setShowImportHelp,
    showShare,
    setShowShare,
    showRsvpPanel,
    setShowRsvpPanel,
    rsvpLinkCopied,
    setRsvpLinkCopied,
    fileInputRef,
    mapCaptureRef,
    exportingPdf,
    setExportingPdf,
    canvasBudget,
    setCanvasBudget,
    mapFullscreen,
    setMapFullscreen,
    saveStatus,
    setSaveStatus,
    hydrated,
    saveTimeout,
    lastSyncedAt,
    lastSyncedGuests,
    saveQueue,
    allTables,
    deletedTableSet,
    tables,
    deletedTables,
    tableById,
    seats,
    seatsById,
    totalSeats,
    occupiedTableIds,
    visibleTables,
    hiddenTableCount,
    emptyVisibleTableIds,
    layout,
    fixtureGuestCount,
    room,
    map,
    tableRot,
    fixtureRot,
    beginRotate,
    setTableRotation,
    setFixtureRotation,
    prevFootprints,
    zoomedInForNames,
    setZoomedInForNames,
    mapScale,
    namesOnMap,
    atOverview,
    zoomToTable,
    clearMapSelection,
    showGuestOnMap,
    placeMovingItem,
    fitMap,
    startLongPress,
    guestById,
    visibleGuests,
    guestLetterIndex,
    groupById,
    guestsByGroupId,
    seatOfGuest,
    mapSearchResults,
    activeGuests,
    unseatedGuests,
    seatedCount,
    notedGuests,
    notedGuestCount,
    mealStats,
    groupStats,
    occupiedCountByTable,
    underfilledTables,
    flatPairs,
    autoGroupPairs,
    flatViolations,
    constraintStatuses,
    violatedCount,
    sideLabel,
    constraintTagsByGuestId,
    liveSummary,
    seatPixel,
    pushUndo,
    performUndo,
    addTableGroup,
    updateTableGroup,
    removeTableGroup,
    removeTableGroupWithUndo,
    renameTable,
    moveTable,
    deleteTableWithUndo,
    restoreTable,
    restoreAllTables,
    addFixture,
    renameFixture,
    setFixtureSizeM,
    resizeFixture,
    moveFixture,
    removeFixtureWithUndo,
    addGuest,
    renameGuest,
    updateGuestNote,
    updateGuestMealChoice,
    cycleRsvpStatus,
    removeGuest,
    removeGuestWithUndo,
    toggleGuestGroup,
    logImport,
    finishParse,
    FLOOR_PLAN_MAX_BYTES,
    handleFloorPlanUpload,
    handleFloorPlanRemove,
    handleSuggestFromFloorPlan,
    applyFloorPlanSuggestion,
    MENU_MAX_BYTES,
    MENU_ALLOWED_EXT,
    handleMenuUpload,
    handleImportFile,
    confirmImport,
    addGroup,
    renameGroup,
    removeGroup,
    removeGroupWithUndo,
    toggleGroupSeatingMode,
    addConstraintFor,
    addGroupConstraint,
    removeConstraint,
    removeConstraintWithUndo,
    assignGuestToSeat,
    clearSeat,
    handleSeatClick,
    handlePoolClick,
    handleDragStart,
    handleDrop,
    clearAllSeats,
    clearAllSeatsWithUndo,
    runSolver,
    safeFileName,
    exportExcel,
    exportPosterPdf,
    applyAgentOperations,
    seatsShort,
    capacityExceeded,
    PANE_ORDER,
    paneIndex,
    prevPane,
    nextPane,
  };
}

export type Planner = ReturnType<typeof usePlannerState>;

export const PlannerContext = createContext<Planner | null>(null);

/** The planner's shared state; only usable inside SeatingPlanner. */
export function usePlanner(): Planner {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("usePlanner must be used inside SeatingPlanner");
  return planner;
}
