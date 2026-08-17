"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import InviteForm from "./InviteForm";

// ---------- palette / tokens ----------
const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#8A8272",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
`;

const genId = () => Math.random().toString(36).slice(2, 9);

const GROUP_COLORS = ["#A8823C", "#54704F", "#4A6FA5", "#8C3B3B", "#7A5C8E", "#B0562F"];

// ---------- types ----------
interface TableGroup {
  id: string;
  label: string;
  count: number | "";
  capacity: number | "";
}
interface Guest {
  id: string;
  name: string;
  groupIds: string[];
}
interface Group {
  id: string;
  name: string;
  color: string;
}
interface Constraint {
  id: string;
  aType: "guest" | "group";
  aId: string;
  bType: "guest" | "group";
  bId: string;
  type: "must" | "cannot";
}
type SeatAssignment = Record<string, string>;
type FillMode = "consolidate" | "spread";
type Role = "owner" | "editor" | "viewer";

interface Member {
  email: string;
  role: string;
}

interface PlannerData {
  tableGroups?: TableGroup[];
  guests?: Guest[];
  groups?: Group[];
  constraints?: Constraint[];
  seatAssignment?: SeatAssignment;
  fillMode?: FillMode;
}

interface SeatingPlannerProps {
  eventId: string;
  initialName: string;
  initialData: PlannerData | null;
  role: Role;
  members: Member[];
}

// ---------- seed data (used only for a brand-new, empty event) ----------
function makeSeedData() {
  const seedTableGroups: TableGroup[] = [
    { id: genId(), label: "Family Round", count: 2, capacity: 8 },
    { id: genId(), label: "Sweetheart Table", count: 1, capacity: 2 },
  ];
  const seedGuestNames = [
    "Ava Chen", "Marcus Webb", "Priya Anand", "Noah Fischer", "Ines Duarte",
    "Leo Zhang", "Sofia Marchetti", "Jonah Reyes", "Clara Wynn", "Theo Baptiste",
  ];
  const seedGroups: Group[] = [
    { id: genId(), name: "Groom's University Friends", color: GROUP_COLORS[0] },
    { id: genId(), name: "Bride's Mom's Family", color: GROUP_COLORS[1] },
  ];
  const seedGuests: Guest[] = seedGuestNames.map((name) => ({ id: genId(), name, groupIds: [] }));
  [1, 5, 7].forEach((i) => seedGuests[i].groupIds.push(seedGroups[0].id));
  [6, 8, 9].forEach((i) => seedGuests[i].groupIds.push(seedGroups[1].id));

  const seedConstraints: Constraint[] = [
    { aType: "guest", a: 0, bType: "guest", b: 1, type: "must" },
    { aType: "guest", a: 1, bType: "guest", b: 5, type: "cannot" },
    { aType: "guest", a: 2, bType: "guest", b: 3, type: "must" },
  ].map((c) => ({
    id: genId(),
    aType: c.aType as "guest",
    aId: seedGuests[c.a].id,
    bType: c.bType as "guest",
    bId: seedGuests[c.b].id,
    type: c.type as "must" | "cannot",
  }));
  seedConstraints.push({
    id: genId(),
    aType: "group",
    aId: seedGroups[0].id,
    bType: "group",
    bId: seedGroups[1].id,
    type: "cannot",
  });

  return { seedTableGroups, seedGuests, seedGroups, seedConstraints };
}

// ---------- geometry helpers ----------
interface Table {
  id: string;
  groupId: string;
  label: string;
  capacity: number;
}
interface Seat {
  id: string;
  tableId: string;
  seatIdx: number;
  capacity: number;
}

function buildTables(tableGroups: TableGroup[]): Table[] {
  const tables: Table[] = [];
  tableGroups.forEach((g) => {
    const count = Number(g.count) > 0 ? Number(g.count) : 1;
    const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : 1;
    for (let i = 0; i < count; i++) {
      tables.push({
        id: `${g.id}-${i}`,
        groupId: g.id,
        label: count > 1 ? `${g.label} ${i + 1}` : g.label,
        capacity,
      });
    }
  });
  return tables;
}

function buildSeats(tables: Table[]): Seat[] {
  const seats: Seat[] = [];
  tables.forEach((t) => {
    for (let i = 0; i < t.capacity; i++) {
      seats.push({ id: `${t.id}#${i}`, tableId: t.id, seatIdx: i, capacity: t.capacity });
    }
  });
  return seats;
}

function areAdjacent(i: number, j: number, n: number) {
  if (n < 2) return false;
  const d = Math.abs(i - j);
  return d === 1 || d === n - 1;
}

function computeLayout(tables: Table[]) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length || 1)));
  const cell = 250;
  const positions: Record<string, { cx: number; cy: number; r: number; seatR: number }> = {};
  tables.forEach((t, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const r = Math.min(58, 34 + t.capacity * 3.2);
    positions[t.id] = {
      cx: col * cell + cell / 2,
      cy: row * cell + cell / 2,
      r,
      seatR: r + 34,
    };
  });
  const rows = Math.ceil(tables.length / cols);
  return { positions, width: cols * cell, height: Math.max(cell, rows * cell) };
}

// ---------- constraint expansion (groups -> flat guest pairs) ----------
interface FlatPair {
  parentId: string;
  aId: string;
  bId: string;
  type: "must" | "cannot";
  mode: "table" | "adjacent";
}
interface FlatViolation extends FlatPair {
  status: "unseated" | "satisfied" | "violated";
  seatA?: string;
  seatB?: string;
}

function expandConstraint(c: Constraint, guestsByGroupId: Record<string, string[]>): FlatPair[] {
  const sideIds = (type: "guest" | "group", id: string) =>
    type === "group" ? guestsByGroupId[id] || [] : id ? [id] : [];
  const mode: "table" | "adjacent" = c.aType === "group" || c.bType === "group" ? "table" : "adjacent";
  const asIds = sideIds(c.aType, c.aId);
  const bsIds = sideIds(c.bType, c.bId);
  const pairs: FlatPair[] = [];
  asIds.forEach((a) => {
    bsIds.forEach((b) => {
      if (a !== b) pairs.push({ parentId: c.id, aId: a, bId: b, type: c.type, mode });
    });
  });
  return pairs;
}

function expandAllConstraints(constraints: Constraint[], guestsByGroupId: Record<string, string[]>) {
  return constraints.flatMap((c) => expandConstraint(c, guestsByGroupId));
}

// ---------- violation computation (operates on flat guest-guest pairs) ----------
function computeFlatViolations(
  flatPairs: FlatPair[],
  seatAssignment: SeatAssignment,
  seatsById: Record<string, Seat>
): FlatViolation[] {
  const seatOfGuest: Record<string, string> = {};
  Object.entries(seatAssignment).forEach(([seatId, guestId]) => {
    if (guestId) seatOfGuest[guestId] = seatId;
  });
  return flatPairs.map((p) => {
    const seatA = seatOfGuest[p.aId];
    const seatB = seatOfGuest[p.bId];
    if (!seatA || !seatB) return { ...p, status: "unseated" as const };
    const sa = seatsById[seatA];
    const sb = seatsById[seatB];
    const sameTable = sa.tableId === sb.tableId;
    const linked = p.mode === "table" ? sameTable : sameTable && areAdjacent(sa.seatIdx, sb.seatIdx, sa.capacity);
    const ok = p.type === "must" ? linked : !linked;
    return { ...p, status: ok ? ("satisfied" as const) : ("violated" as const), seatA, seatB };
  });
}

function aggregateConstraintStatus(constraints: Constraint[], flatViolations: FlatViolation[]) {
  const byParent: Record<string, FlatViolation[]> = {};
  flatViolations.forEach((v) => {
    (byParent[v.parentId] = byParent[v.parentId] || []).push(v);
  });
  const statuses: Record<string, string> = {};
  constraints.forEach((c) => {
    const pairs = byParent[c.id] || [];
    if (pairs.length === 0) statuses[c.id] = "empty";
    else if (pairs.some((p) => p.status === "violated")) statuses[c.id] = "violated";
    else if (pairs.some((p) => p.status === "unseated")) statuses[c.id] = "unseated";
    else statuses[c.id] = "satisfied";
  });
  return statuses;
}

// ---------- simulated annealing solver ----------
function solveSeating(
  seats: Seat[],
  guestIds: string[],
  flatPairs: FlatPair[],
  seatsById: Record<string, Seat>,
  fillMode: FillMode = "spread"
): SeatAssignment {
  const n = seats.length;
  if (n === 0 || guestIds.length === 0) return {};

  const distinctTableIds = [...new Set(seats.map((s) => s.tableId))];
  const avgPerTable = distinctTableIds.length ? guestIds.length / distinctTableIds.length : 0;
  const spread = fillMode === "spread" && distinctTableIds.length > 1;

  function cost(assign: (string | null)[], guestPos: Record<string, number>) {
    let total = 0;
    for (const p of flatPairs) {
      const pa = guestPos[p.aId];
      const pb = guestPos[p.bId];
      if (pa === undefined || pb === undefined) {
        total += 6;
        continue;
      }
      const sa = seats[pa];
      const sb = seats[pb];
      const sameTable = sa.tableId === sb.tableId;
      const linked = p.mode === "table" ? sameTable : sameTable && areAdjacent(sa.seatIdx, sb.seatIdx, sa.capacity);
      if (p.type === "must" && !linked) total += 12;
      if (p.type === "cannot" && linked) total += 12;
    }
    if (spread) {
      const tableCounts: Record<string, number> = {};
      for (let i = 0; i < assign.length; i++) {
        if (assign[i]) {
          const tid = seats[i].tableId;
          tableCounts[tid] = (tableCounts[tid] || 0) + 1;
        }
      }
      for (const tid of distinctTableIds) {
        const c = tableCounts[tid] || 0;
        total += Math.pow(c - avgPerTable, 2) * 0.6;
      }
    }
    return total;
  }

  function randomInit() {
    const positions = Array.from({ length: n }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const assign: (string | null)[] = new Array(n).fill(null);
    const guestPos: Record<string, number> = {};
    guestIds.forEach((gid, i) => {
      const seatPos = positions[i];
      assign[seatPos] = gid;
      guestPos[gid] = seatPos;
    });
    return { assign, guestPos };
  }

  let best: (string | null)[] | null = null;
  let bestCost = Infinity;
  const restarts = guestIds.length > 60 ? 2 : 3;
  const iterations = Math.min(16000, 3500 + guestIds.length * 140);

  for (let r = 0; r < restarts; r++) {
    const init = randomInit();
    let assign = init.assign;
    const guestPos = init.guestPos;
    let curCost = cost(assign, guestPos);
    let T = 8;
    for (let it = 0; it < iterations; it++) {
      T = 8 * Math.pow(0.0006, it / iterations);
      const i = Math.floor(Math.random() * n);
      const j = Math.floor(Math.random() * n);
      if (i === j) continue;
      const gi = assign[i];
      const gj = assign[j];
      assign[i] = gj;
      assign[j] = gi;
      if (gi) guestPos[gi] = j;
      if (gj) guestPos[gj] = i;

      const newCost = cost(assign, guestPos);
      const delta = newCost - curCost;
      if (delta <= 0 || Math.random() < Math.exp(-delta / Math.max(T, 0.01))) {
        curCost = newCost;
      } else {
        assign[i] = gi;
        assign[j] = gj;
        if (gi) guestPos[gi] = i;
        if (gj) guestPos[gj] = j;
      }
      if (curCost === 0) break;
    }
    if (curCost < bestCost) {
      bestCost = curCost;
      best = assign;
    }
    if (bestCost === 0) break;
  }

  const seatAssignment: SeatAssignment = {};
  (best ?? []).forEach((guestId, i) => {
    if (guestId) seatAssignment[seats[i].id] = guestId;
  });
  return seatAssignment;
}

function pickConsolidatedTables(tables: Table[], guestCount: number) {
  const sorted = [...tables].sort((a, b) => b.capacity - a.capacity);
  let sum = 0;
  const chosen: string[] = [];
  for (const t of sorted) {
    if (sum >= guestCount) break;
    chosen.push(t.id);
    sum += t.capacity;
  }
  if (sum < guestCount) return tables.map((t) => t.id);
  return chosen;
}

// ---------- spreadsheet import parsing ----------
const NAME_HEADERS = ["name", "guest", "guest name", "full name", "attendee", "attendee name"];
const GROUP_HEADERS = ["group", "groups", "table group", "party", "category", "tag", "tags"];

function parseGuestRows(raw: unknown[][]) {
  const guests: { name: string; groupNames: string[] }[] = [];
  const groupNamesFound = new Set<string>();
  if (!raw || raw.length === 0) return { guests, groupNamesFound };
  const header = (raw[0] || []).map((h) => String(h ?? "").trim().toLowerCase());
  const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));
  const groupIdx = header.findIndex((h) => GROUP_HEADERS.includes(h));
  const hasHeader = nameIdx !== -1;
  const startRow = hasHeader ? 1 : 0;
  const nameCol = hasHeader ? nameIdx : 0;
  const groupCol = hasHeader ? groupIdx : raw[0] && raw[0].length > 1 ? 1 : -1;

  for (let i = startRow; i < raw.length; i++) {
    const row = raw[i] || [];
    const name = String(row[nameCol] ?? "").trim();
    if (!name) continue;
    let groupNames: string[] = [];
    if (groupCol >= 0) {
      const cell = String(row[groupCol] ?? "").trim();
      if (cell) groupNames = cell.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
    }
    groupNames.forEach((gn) => groupNamesFound.add(gn));
    guests.push({ name, groupNames });
  }
  return { guests, groupNamesFound };
}

// ---------- small UI atoms ----------
function IconBtn({
  onClick,
  title,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded-md transition-colors"
      style={{ color: danger ? C.wine : C.muted, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = danger ? "#F3E4E4" : C.goldSoft;
      }}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {children}
    </button>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="text-xs tracking-[0.18em] uppercase font-semibold" style={{ color: C.gold, fontFamily: "Inter, sans-serif" }}>
        {eyebrow}
      </div>
      <h2 className="text-2xl mt-1" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
        {title}
      </h2>
    </div>
  );
}

// ---------- main component ----------
export default function SeatingPlanner({ eventId, initialName, initialData, role, members }: SeatingPlannerProps) {
  const readOnly = role === "viewer";
  const seeds = useMemo(() => makeSeedData(), []);
  const hasSavedData = !!(
    initialData &&
    ((initialData.guests && initialData.guests.length > 0) ||
      (initialData.tableGroups && initialData.tableGroups.length > 0))
  );

  const [eventName, setEventName] = useState(initialName || "Untitled event");
  const [tab, setTab] = useState("setup");
  const [tableGroups, setTableGroups] = useState<TableGroup[]>(
    hasSavedData ? initialData!.tableGroups ?? [] : seeds.seedTableGroups
  );
  const [guests, setGuests] = useState<Guest[]>(hasSavedData ? initialData!.guests ?? [] : seeds.seedGuests);
  const [groups, setGroups] = useState<Group[]>(hasSavedData ? initialData!.groups ?? [] : seeds.seedGroups);
  const [constraints, setConstraints] = useState<Constraint[]>(
    hasSavedData ? initialData!.constraints ?? [] : seeds.seedConstraints
  );
  const [seatAssignment, setSeatAssignment] = useState<SeatAssignment>(
    hasSavedData ? initialData!.seatAssignment ?? {} : {}
  );
  const [solving, setSolving] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [seatingView, setSeatingView] = useState("map");
  const [picked, setPicked] = useState<string | null>(null);
  const [hoveredGuest, setHoveredGuest] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [fillMode, setFillMode] = useState<FillMode>(
    hasSavedData ? initialData!.fillMode ?? "spread" : "spread"
  );
  const [activeTableIds, setActiveTableIds] = useState<Set<string> | null>(null);
  const [showAllTables, setShowAllTables] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    guests: { name: string; groupNames: string[] }[];
    groupNames: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Supabase autosave ----
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (readOnly) return;
    setSaveStatus("saving");
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("events")
        .update({
          name: eventName,
          data: { tableGroups, guests, groups, constraints, seatAssignment, fillMode },
          updated_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      setSaveStatus(error ? "error" : "saved");
    }, 800);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, tableGroups, guests, groups, constraints, seatAssignment, fillMode]);

  const tables = useMemo(() => buildTables(tableGroups), [tableGroups]);
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
    if (!activeTableIds || showAllTables) return tables;
    return tables.filter((t) => activeTableIds.has(t.id) || occupiedTableIds.has(t.id));
  }, [tables, activeTableIds, showAllTables, occupiedTableIds]);

  const hiddenTableCount = tables.length - visibleTables.length;
  const layout = useMemo(() => computeLayout(visibleTables), [visibleTables]);

  const guestById = useMemo(() => Object.fromEntries(guests.map((g) => [g.id, g])), [guests]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const guestsByGroupId = useMemo(() => {
    const m: Record<string, string[]> = {};
    guests.forEach((g) => (g.groupIds || []).forEach((gid) => (m[gid] = m[gid] || []).push(g.id)));
    return m;
  }, [guests]);
  const seatOfGuest = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(seatAssignment).forEach(([seatId, guestId]) => {
      if (guestId) m[guestId] = seatId;
    });
    return m;
  }, [seatAssignment]);
  const unseatedGuests = useMemo(() => guests.filter((g) => !seatOfGuest[g.id]), [guests, seatOfGuest]);

  const flatPairs = useMemo(() => expandAllConstraints(constraints, guestsByGroupId), [constraints, guestsByGroupId]);
  const flatViolations = useMemo(() => computeFlatViolations(flatPairs, seatAssignment, seatsById), [flatPairs, seatAssignment, seatsById]);
  const constraintStatuses = useMemo(() => aggregateConstraintStatus(constraints, flatViolations), [constraints, flatViolations]);
  const violatedCount = Object.values(constraintStatuses).filter((s) => s === "violated").length;
  const sideLabel = (type: "guest" | "group", id: string) =>
    (type === "group" ? groupById[id]?.name : guestById[id]?.name) || "—";
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
    setActiveTableIds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableGroups]);

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
    const angle = -Math.PI / 2 + (2 * Math.PI * s.seatIdx) / s.capacity;
    return {
      x: pos.cx + pos.seatR * Math.cos(angle),
      y: pos.cy + pos.seatR * Math.sin(angle),
    };
  }

  // ---- table group handlers ----
  const addTableGroup = () => {
    if (readOnly) return;
    setTableGroups((tg) => [...tg, { id: genId(), label: `Table type ${tg.length + 1}`, count: 1, capacity: 8 }]);
  };
  const updateTableGroup = (id: string, patch: Partial<TableGroup>) => {
    if (readOnly) return;
    setTableGroups((tg) => tg.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };
  const removeTableGroup = (id: string) => {
    if (readOnly) return;
    setTableGroups((tg) => tg.filter((g) => g.id !== id));
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
  const removeGuest = (id: string) => {
    if (readOnly) return;
    setGuests((g) => g.filter((x) => x.id !== id));
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
  function finishParse(raw: unknown[][]) {
    const { guests: parsedGuests, groupNamesFound } = parseGuestRows(raw);
    if (parsedGuests.length === 0) {
      setImportError("Couldn't find any names in that file — make sure there's a column of guest names.");
      return;
    }
    setImportError(null);
    setPendingImport({ guests: parsedGuests, groupNames: [...groupNamesFound] });
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        if (isCsv) {
          const result = Papa.parse(String(evt.target?.result), { skipEmptyLines: true });
          finishParse(result.data as unknown[][]);
        } else {
          const wb = XLSX.read(new Uint8Array(evt.target?.result as ArrayBuffer), { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
          finishParse(raw);
        }
      } catch {
        setImportError("Couldn't read that file. Make sure it's a .xlsx, .xls, or .csv file.");
      }
    };
    if (isCsv) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function confirmImport(mode: "add" | "replace") {
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
    const importedGuests: Guest[] = pendingImport.guests.map((g) => ({
      id: genId(),
      name: g.name,
      groupIds: g.groupNames.map((gn) => existingByName[gn.trim().toLowerCase()]).filter(Boolean),
    }));
    setGroups((gs) => [...gs, ...newGroups]);
    setGuests((gs) => (mode === "replace" ? importedGuests : [...gs, ...importedGuests]));
    setImportSuccess(
      `Imported ${importedGuests.length} guest${importedGuests.length === 1 ? "" : "s"}` +
        (newGroups.length ? ` and created ${newGroups.length} group${newGroups.length === 1 ? "" : "s"}.` : ".")
    );
    setPendingImport(null);
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

  // ---- constraint handlers ----
  const addConstraint = () => {
    if (readOnly) return;
    if (guests.length < 2) return;
    setConstraints((c) => [
      ...c,
      { id: genId(), aType: "guest", aId: guests[0].id, bType: "guest", bId: guests[1].id, type: "must" },
    ]);
  };
  const updateConstraint = (id: string, patch: Partial<Constraint>) => {
    if (readOnly) return;
    setConstraints((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const removeConstraint = (id: string) => {
    if (readOnly) return;
    setConstraints((c) => c.filter((x) => x.id !== id));
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

  function runSolver() {
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
      const result = solveSeating(poolSeats, guests.map((g) => g.id), flatPairs, poolSeatsById, fillMode);
      setSeatAssignment(result);
      setActiveTableIds(new Set(chosenIds));
      setShowAllTables(false);
      setSolving(false);
      setJustGenerated(true);
    }, 40);
  }

  const seatsShort = totalSeats < guests.length;

  return (
    <div className="min-h-screen w-full flex" style={{ backgroundColor: C.paper, fontFamily: "Inter, sans-serif" }}>
      <style>{FONTS}</style>

      {/* sidebar */}
      <aside className="w-56 shrink-0 hidden sm:flex flex-col gap-1 p-5 border-r" style={{ borderColor: C.line }}>
        <div className="mb-4">
          <a href="/events" className="text-[10px] tracking-[0.2em] uppercase font-semibold" style={{ color: C.gold, textDecoration: "none" }}>
            ← My events
          </a>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            disabled={readOnly}
            className="mt-1 w-full bg-transparent outline-none text-lg leading-tight"
            style={{ fontFamily: "Fraunces, serif", color: C.ink }}
          />
          <div className="mt-1 text-[10px]" style={{ color: C.muted }}>
            {readOnly ? "View only" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : saveStatus === "saved" ? "Saved" : ""}
          </div>
        </div>
        {[
          { id: "setup", label: "1. Tables", icon: Table2 },
          { id: "guests", label: "2. Guests & rules", icon: Users },
          { id: "seating", label: "3. Seating map", icon: LayoutGrid },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors"
              style={{
                backgroundColor: active ? C.ink : "transparent",
                color: active ? C.paper : C.ink,
              }}
            >
              <Icon size={15} />
              {t.label}
              {t.id === "seating" && violatedCount > 0 && (
                <span
                  className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: active ? C.wine : "#F3E4E4", color: active ? "#fff" : C.wine }}
                >
                  {violatedCount}
                </span>
              )}
            </button>
          );
        })}

        <div className="mt-auto pt-6 text-xs leading-relaxed" style={{ color: C.muted }}>
          <div className="flex justify-between py-0.5">
            <span>Guests</span>
            <span>{guests.length}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Tables</span>
            <span>{tables.length}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Seats</span>
            <span style={{ color: seatsShort ? C.wine : C.muted }}>{totalSeats}</span>
          </div>
        </div>

        {role === "owner" && (
          <div className="pt-4 mt-4 border-t" style={{ borderColor: C.line }}>
            <div className="text-[10px] tracking-[0.15em] uppercase font-semibold mb-2" style={{ color: C.gold }}>
              Share
            </div>
            <InviteForm eventId={eventId} initialMembers={members} />
          </div>
        )}
      </aside>

      {/* mobile tab bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 flex justify-around p-2 border-t z-20" style={{ backgroundColor: C.card, borderColor: C.line }}>
        {[
          { id: "setup", icon: Table2 },
          { id: "guests", icon: Users },
          { id: "seating", icon: LayoutGrid },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="p-2 rounded-lg" style={{ color: tab === t.id ? C.gold : C.muted }}>
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      {/* main */}
      <main className="flex-1 p-6 sm:p-10 pb-24 sm:pb-10 overflow-auto">
        {tab === "setup" && (
          <div className="max-w-2xl">
            <SectionTitle eyebrow="Step one" title="Configure your tables" />
            <p className="text-sm mb-6" style={{ color: C.muted }}>
              Define the table types available for this event — how many of each, and how many seats per table.
            </p>

            <div className="space-y-3">
              {tableGroups.map((g) => (
                <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: C.card, borderColor: C.line }}>
                  <input
                    value={g.label}
                    onChange={(e) => updateTableGroup(g.id, { label: e.target.value })}
                    disabled={readOnly}
                    className="flex-1 bg-transparent outline-none text-sm font-medium"
                    style={{ color: C.ink }}
                    placeholder="Table type name"
                  />
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                    Tables
                    <input
                      type="number"
                      min={0}
                      value={g.count}
                      disabled={readOnly}
                      onChange={(e) => updateTableGroup(g.id, { count: e.target.value === "" ? "" : Number(e.target.value) })}
                      onBlur={() => {
                        if (g.count === "") updateTableGroup(g.id, { count: 0 });
                      }}
                      className="w-14 px-2 py-1 rounded-md border text-sm text-center"
                      style={{ borderColor: C.line }}
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                    Seats each
                    <input
                      type="number"
                      min={0}
                      value={g.capacity}
                      disabled={readOnly}
                      onChange={(e) => updateTableGroup(g.id, { capacity: e.target.value === "" ? "" : Number(e.target.value) })}
                      onBlur={() => {
                        if (g.capacity === "") updateTableGroup(g.id, { capacity: 0 });
                      }}
                      className="w-14 px-2 py-1 rounded-md border text-sm text-center"
                      style={{ borderColor: C.line }}
                    />
                  </label>
                  <IconBtn danger title="Remove table type" onClick={() => removeTableGroup(g.id)} disabled={readOnly}>
                    <Trash2 size={15} />
                  </IconBtn>
                </div>
              ))}
            </div>

            <button
              onClick={addTableGroup}
              disabled={readOnly}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ color: C.gold, border: `1px dashed ${C.gold}` }}
            >
              <Plus size={14} /> Add table type
            </button>

            <div
              className="mt-8 p-4 rounded-xl text-sm flex items-center gap-2"
              style={{ backgroundColor: seatsShort ? "#F3E4E4" : "#EEF2EA", color: seatsShort ? C.wine : C.sage }}
            >
              {seatsShort ? <AlertTriangle size={16} /> : <Check size={16} />}
              {seatsShort
                ? `You have ${guests.length} guests but only ${totalSeats} seats. Add more tables before generating a plan.`
                : `${totalSeats} seats configured for ${guests.length} guests — ${totalSeats - guests.length} spare.`}
            </div>
          </div>
        )}

        {tab === "guests" && (
          <div className="max-w-3xl grid md:grid-cols-2 gap-10">
            <div>
              <SectionTitle eyebrow="Step two" title="Guest list" />

              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={readOnly}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  <Upload size={13} /> Import from Excel or CSV
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} style={{ display: "none" }} />
              </div>

              {importError && (
                <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ backgroundColor: "#F3E4E4", color: C.wine }}>
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ backgroundColor: "#EEF2EA", color: C.sage }}>
                  {importSuccess}
                </div>
              )}
              {pendingImport && (
                <div className="mb-3 p-3 rounded-lg text-xs" style={{ backgroundColor: C.goldSoft, color: C.ink }}>
                  Found {pendingImport.guests.length} guest{pendingImport.guests.length === 1 ? "" : "s"} in the file
                  {pendingImport.groupNames.length > 0 && (
                    <>
                      {" "}
                      ({pendingImport.groupNames.length} group{pendingImport.groupNames.length === 1 ? "" : "s"}: {pendingImport.groupNames.join(", ")})
                    </>
                  )}
                  .
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => confirmImport("add")} className="px-2.5 py-1 rounded-md font-semibold" style={{ backgroundColor: C.gold, color: "#fff" }}>
                      Add to list
                    </button>
                    <button onClick={() => confirmImport("replace")} className="px-2.5 py-1 rounded-md font-semibold border" style={{ borderColor: C.wine, color: C.wine }}>
                      Replace list
                    </button>
                    <button onClick={() => setPendingImport(null)} className="px-2.5 py-1 rounded-md" style={{ color: C.muted }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {groups.map((gr) => (
                  <div key={gr.id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs" style={{ backgroundColor: gr.color, color: "#fff" }}>
                    <input
                      value={gr.name}
                      onChange={(e) => renameGroup(gr.id, e.target.value)}
                      disabled={readOnly}
                      className="bg-transparent outline-none"
                      style={{ color: "#fff", width: `${Math.max(60, gr.name.length * 6.5)}px` }}
                    />
                    {!readOnly && (
                      <button onClick={() => removeGroup(gr.id)} className="p-0.5 rounded-full hover:bg-black/10">
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addGroup} disabled={readOnly} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-40" style={{ color: C.gold, border: `1px dashed ${C.gold}` }}>
                  <Plus size={11} /> Group
                </button>
              </div>

              <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
                {guests.map((g) => (
                  <div key={g.id} className="px-3 py-2 border-b last:border-b-0" style={{ borderColor: C.line }}>
                    <div className="flex items-center gap-2">
                      <input
                        value={g.name}
                        onChange={(e) => renameGuest(g.id, e.target.value)}
                        disabled={readOnly}
                        className="flex-1 bg-transparent outline-none text-sm"
                        style={{ color: C.ink, fontFamily: "Fraunces, serif" }}
                      />
                      <IconBtn danger title="Remove guest" onClick={() => removeGuest(g.id)} disabled={readOnly}>
                        <X size={14} />
                      </IconBtn>
                    </div>
                    {groups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {groups.map((gr) => {
                          const active = g.groupIds?.includes(gr.id);
                          return (
                            <button
                              key={gr.id}
                              onClick={() => toggleGuestGroup(g.id, gr.id)}
                              disabled={readOnly}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium disabled:opacity-60"
                              style={{
                                borderColor: gr.color,
                                backgroundColor: active ? gr.color : "transparent",
                                color: active ? "#fff" : gr.color,
                              }}
                            >
                              {gr.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    value={newGuestName}
                    onChange={(e) => setNewGuestName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addGuest()}
                    disabled={readOnly}
                    placeholder="Add a guest, press Enter"
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: C.ink }}
                  />
                  <IconBtn title="Add guest" onClick={addGuest} disabled={readOnly}>
                    <Plus size={15} />
                  </IconBtn>
                </div>
              </div>
            </div>

            <div>
              <SectionTitle eyebrow="Rules" title="Seating constraints" />
              <div className="space-y-2">
                {constraints.map((c) => {
                  const groupInvolved = c.aType === "group" || c.bType === "group";
                  const sideOptions = (type: "guest" | "group") => (type === "group" ? groups : guests);
                  return (
                    <div key={c.id} className="p-2.5 rounded-lg border text-sm space-y-1.5" style={{ borderColor: C.line, backgroundColor: C.card }}>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={c.aType}
                          disabled={readOnly}
                          onChange={(e) => {
                            const newType = e.target.value as "guest" | "group";
                            const opts = sideOptions(newType);
                            updateConstraint(c.id, { aType: newType, aId: opts[0]?.id || "" });
                          }}
                          className="text-[10px] rounded-md px-1 py-1 border"
                          style={{ borderColor: C.line, color: C.muted }}
                        >
                          <option value="guest">Person</option>
                          <option value="group">Group</option>
                        </select>
                        <select
                          value={c.aId}
                          disabled={readOnly}
                          onChange={(e) => updateConstraint(c.id, { aId: e.target.value })}
                          className="flex-1 bg-transparent outline-none text-xs min-w-0"
                        >
                          {sideOptions(c.aType).map((o) => (
                            <option key={o.id} value={o.id}>
                              {"name" in o ? o.name : ""}
                            </option>
                          ))}
                        </select>
                        <IconBtn danger title="Remove rule" onClick={() => removeConstraint(c.id)} disabled={readOnly}>
                          <X size={14} />
                        </IconBtn>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={c.type}
                          disabled={readOnly}
                          onChange={(e) => updateConstraint(c.id, { type: e.target.value as "must" | "cannot" })}
                          className="text-xs font-semibold rounded-md px-1.5 py-1"
                          style={{
                            color: c.type === "must" ? C.sage : C.wine,
                            backgroundColor: c.type === "must" ? "#EEF2EA" : "#F3E4E4",
                          }}
                        >
                          <option value="must">{groupInvolved ? "must sit at same table as" : "must sit next to"}</option>
                          <option value="cannot">{groupInvolved ? "cannot sit at same table as" : "cannot sit next to"}</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={c.bType}
                          disabled={readOnly}
                          onChange={(e) => {
                            const newType = e.target.value as "guest" | "group";
                            const opts = sideOptions(newType);
                            updateConstraint(c.id, { bType: newType, bId: opts[0]?.id || "" });
                          }}
                          className="text-[10px] rounded-md px-1 py-1 border"
                          style={{ borderColor: C.line, color: C.muted }}
                        >
                          <option value="guest">Person</option>
                          <option value="group">Group</option>
                        </select>
                        <select
                          value={c.bId}
                          disabled={readOnly}
                          onChange={(e) => updateConstraint(c.id, { bId: e.target.value })}
                          className="flex-1 bg-transparent outline-none text-xs min-w-0"
                        >
                          {sideOptions(c.bType).map((o) => (
                            <option key={o.id} value={o.id}>
                              {"name" in o ? o.name : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={addConstraint}
                disabled={readOnly || guests.length < 2}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
                style={{ color: C.gold, border: `1px dashed ${C.gold}` }}
              >
                <Plus size={14} /> Add rule
              </button>
            </div>
          </div>
        )}

        {tab === "seating" && (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
              <SectionTitle eyebrow="Step three" title="Seating map" />
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.line }}>
                  <button
                    onClick={() => setSeatingView("map")}
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: seatingView === "map" ? C.ink : C.card, color: seatingView === "map" ? C.paper : C.ink }}
                  >
                    Map
                  </button>
                  <button
                    onClick={() => setSeatingView("table")}
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: seatingView === "table" ? C.ink : C.card, color: seatingView === "table" ? C.paper : C.ink }}
                  >
                    Table
                  </button>
                </div>
                <button
                  onClick={runSolver}
                  disabled={readOnly || seatsShort || solving || guests.length === 0}
                  className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                  style={{ backgroundColor: C.gold, color: "#fff" }}
                >
                  <Wand2 size={15} />
                  {solving ? "Generating…" : "Auto-generate seating"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: C.muted }}>
                  If there are more seats than guests
                </span>
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.line }}>
                  <button
                    onClick={() => setFillMode("consolidate")}
                    disabled={readOnly}
                    title="Fill tables to capacity and leave extras empty"
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: fillMode === "consolidate" ? C.ink : C.card, color: fillMode === "consolidate" ? C.paper : C.ink }}
                  >
                    Consolidate tables
                  </button>
                  <button
                    onClick={() => setFillMode("spread")}
                    disabled={readOnly}
                    title="Spread guests evenly across every table"
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: fillMode === "spread" ? C.ink : C.card, color: fillMode === "spread" ? C.paper : C.ink }}
                  >
                    Spread across all tables
                  </button>
                </div>
              </div>
              {hiddenTableCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: C.muted }}>
                  <input type="checkbox" checked={showAllTables} onChange={(e) => setShowAllTables(e.target.checked)} />
                  Show {hiddenTableCount} unused table{hiddenTableCount > 1 ? "s" : ""}
                </label>
              )}
            </div>

            {liveSummary && (
              <div
                className="mb-5 p-3 rounded-xl text-sm flex items-start gap-2"
                style={{ backgroundColor: liveSummary.violated.length ? "#F3E4E4" : "#EEF2EA", color: liveSummary.violated.length ? C.wine : C.sage }}
              >
                <Sparkles size={16} className="mt-0.5 shrink-0" />
                <div>
                  {justGenerated && <span className="font-semibold">Generated. </span>}
                  {liveSummary.satisfied} of {liveSummary.total} rules currently satisfied.
                  {liveSummary.violated.length > 0 && (
                    <> Still conflicting: {liveSummary.violated.map((v) => `${sideLabel(v.aType, v.aId)} / ${sideLabel(v.bType, v.bId)}`).join(", ")}.</>
                  )}
                  {liveSummary.violated.length === 0 && " Drag anyone and this updates instantly."}
                </div>
              </div>
            )}

            {unseatedGuests.length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                  Unseated ({unseatedGuests.length}) — {picked ? "click a seat to place" : "click a guest, then a seat"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {unseatedGuests.map((g) => (
                    <div
                      key={g.id}
                      draggable={!readOnly}
                      onDragStart={(e) => handleDragStart(e, g.id)}
                      onClick={() => handlePoolClick(g.id)}
                      className="px-3 py-1.5 rounded-lg text-sm cursor-pointer border select-none"
                      style={{
                        fontFamily: "Fraunces, serif",
                        backgroundColor: picked === g.id ? C.gold : C.card,
                        color: picked === g.id ? "#fff" : C.ink,
                        borderColor: C.goldSoft,
                      }}
                    >
                      {g.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seatingView === "map" ? (
              <div className="relative rounded-2xl border p-6 overflow-auto" style={{ borderColor: C.line, backgroundColor: "#FCFAF4" }} onDragOver={(e) => e.preventDefault()}>
                <div className="relative" style={{ width: layout.width, height: layout.height, minWidth: layout.width }}>
                  <svg className="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height}>
                    {flatViolations
                      .filter((v) => v.status !== "unseated")
                      .filter((v) => v.status === "violated" || v.aId === hoveredGuest || v.bId === hoveredGuest || v.aId === picked || v.bId === picked)
                      .map((v) => {
                        const p1 = seatPixel(seatOfGuest[v.aId]);
                        const p2 = seatPixel(seatOfGuest[v.bId]);
                        const bad = v.status === "violated";
                        return (
                          <line
                            key={`${v.parentId}-${v.aId}-${v.bId}`}
                            x1={p1.x}
                            y1={p1.y}
                            x2={p2.x}
                            y2={p2.y}
                            stroke={bad ? C.wine : C.gold}
                            strokeWidth={bad ? 2 : 1.5}
                            strokeDasharray={bad ? "5,4" : "0"}
                            opacity={0.75}
                          />
                        );
                      })}
                  </svg>

                  {visibleTables.map((t) => {
                    const pos = layout.positions[t.id];
                    return (
                      <div key={t.id}>
                        <div
                          className="absolute rounded-full border-2 flex items-center justify-center text-center px-2"
                          style={{
                            left: pos.cx - pos.r,
                            top: pos.cy - pos.r,
                            width: pos.r * 2,
                            height: pos.r * 2,
                            borderColor: C.goldSoft,
                            backgroundColor: "#fff",
                          }}
                        >
                          <span className="text-[11px] font-medium leading-tight" style={{ color: C.muted, fontFamily: "Inter, sans-serif" }}>
                            {t.label}
                          </span>
                        </div>
                        {Array.from({ length: t.capacity }).map((_, i) => {
                          const seatId = `${t.id}#${i}`;
                          const angle = -Math.PI / 2 + (2 * Math.PI * i) / t.capacity;
                          const x = pos.cx + pos.seatR * Math.cos(angle);
                          const y = pos.cy + pos.seatR * Math.sin(angle);
                          const guestId = seatAssignment[seatId];
                          const guestName = guestId ? guestById[guestId]?.name : null;
                          const hasViolation = flatViolations.some((v) => v.status === "violated" && (v.seatA === seatId || v.seatB === seatId));
                          return (
                            <div
                              key={seatId}
                              onClick={() => handleSeatClick(seatId)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => handleDrop(e, seatId)}
                              onMouseEnter={() => guestId && setHoveredGuest(guestId)}
                              onMouseLeave={() => setHoveredGuest(null)}
                              draggable={!!guestId && !readOnly}
                              onDragStart={(e) => guestId && handleDragStart(e, guestId)}
                              className="absolute flex items-center justify-center text-center cursor-pointer transition-transform hover:scale-105"
                              style={{
                                left: x - 34,
                                top: y - 15,
                                width: 68,
                                height: 30,
                                borderRadius: 4,
                                border: `1.5px solid ${hasViolation ? C.wine : guestId ? C.gold : C.line}`,
                                backgroundColor: picked === guestId ? C.gold : guestId ? "#fff" : "transparent",
                                borderStyle: guestId ? "solid" : "dashed",
                              }}
                              title={guestName || "Empty seat"}
                            >
                              <span
                                className="text-[10px] px-1 truncate"
                                style={{
                                  fontFamily: guestId ? "Fraunces, serif" : "Inter, sans-serif",
                                  color: picked === guestId ? "#fff" : guestId ? C.ink : C.muted,
                                }}
                              >
                                {guestName || "+"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: C.paper }}>
                      <th className="text-left px-4 py-2 font-semibold" style={{ color: C.muted }}>
                        Table
                      </th>
                      <th className="text-left px-4 py-2 font-semibold" style={{ color: C.muted }}>
                        Seat
                      </th>
                      <th className="text-left px-4 py-2 font-semibold" style={{ color: C.muted }}>
                        Guest
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTables.map((t) =>
                      Array.from({ length: t.capacity }).map((_, i) => {
                        const seatId = `${t.id}#${i}`;
                        const guestId = seatAssignment[seatId] || "";
                        const hasViolation = flatViolations.some((v) => v.status === "violated" && (v.seatA === seatId || v.seatB === seatId));
                        return (
                          <tr key={seatId} className="border-t" style={{ borderColor: C.line }}>
                            <td className="px-4 py-1.5" style={{ color: C.ink }}>
                              {t.label}
                            </td>
                            <td className="px-4 py-1.5" style={{ color: C.muted }}>
                              {i + 1}
                            </td>
                            <td className="px-4 py-1.5">
                              <select
                                value={guestId}
                                disabled={readOnly}
                                onChange={(e) => {
                                  if (e.target.value) assignGuestToSeat(e.target.value, seatId);
                                  else clearSeat(seatId);
                                }}
                                className="text-sm outline-none bg-transparent"
                                style={{ color: hasViolation ? C.wine : C.ink }}
                              >
                                <option value="">— empty —</option>
                                {guests.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                              </select>
                              {hasViolation && <AlertTriangle size={12} className="inline ml-1" style={{ color: C.wine }} />}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
