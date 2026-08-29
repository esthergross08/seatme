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
  Palette,
  Download,
  FileImage,
  StickyNote,
  Link2,
  Shuffle,
  Undo2,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import InviteForm from "./InviteForm";
import AgentChat from "./AgentChat";
import DecorPanel from "./DecorPanel";
import type { AgentOperation, AgentApplyResult } from "@/lib/agentOperations";

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
  muted: "#736D5F",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
`;

const genId = () => Math.random().toString(36).slice(2, 9);

const GROUP_COLORS = ["#A8823C", "#54704F", "#4A6FA5", "#8C3B3B", "#7A5C8E", "#B0562F"];

// ---------- types ----------
type TableShape = "round" | "oval" | "square" | "rectangle";
interface TableGroup {
  id: string;
  label: string;
  count: number | "";
  capacity: number | "";
  shape?: TableShape;
}
type RsvpStatus = "attending" | "pending" | "declined";
interface Guest {
  id: string;
  name: string;
  groupIds: string[];
  note?: string;
  email?: string;
  rsvpStatus?: RsvpStatus;
  mealChoice?: string;
}
type GroupSeatingMode = "together" | "mixed";
interface Group {
  id: string;
  name: string;
  color: string;
  // Undefined means "together" — the default, and what most people mean when
  // they tag a group at all. "mixed" is an explicit opt-in to deliberately
  // spread that group's members across different tables instead.
  seatingMode?: GroupSeatingMode;
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
  tableNameOverrides?: Record<string, string>;
  tablePositions?: Record<string, { x: number; y: number }>;
}

interface SeatingPlannerProps {
  eventId: string;
  initialName: string;
  initialData: PlannerData | null;
  role: Role;
  members: Member[];
  initialEventDate?: string | null;
  initialLocation?: string | null;
  initialMaxCapacity?: number | null;
}

// ---------- geometry helpers ----------
interface Table {
  id: string;
  groupId: string;
  label: string;
  capacity: number;
  shape: TableShape;
}
interface Seat {
  id: string;
  tableId: string;
  seatIdx: number;
  capacity: number;
}

function buildTables(tableGroups: TableGroup[], nameOverrides: Record<string, string> = {}): Table[] {
  const tables: Table[] = [];
  tableGroups.forEach((g) => {
    const count = Number(g.count) > 0 ? Number(g.count) : 1;
    const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : 1;
    for (let i = 0; i < count; i++) {
      const id = `${g.id}-${i}`;
      const autoLabel = count > 1 ? `${g.label} ${i + 1}` : g.label;
      const override = nameOverrides[id];
      tables.push({
        id,
        groupId: g.id,
        label: override && override.trim().length > 0 ? override : autoLabel,
        capacity,
        shape: g.shape || "round",
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

// Rough px-per-character estimate for the 11px table-name input, plus room for
// the box's own horizontal padding — used to grow tables so a long custom name
// (e.g. "The Smith-Jones Family") gets space instead of clipping or, worse,
// forcing tables close enough together that neighboring name tags overlap.
function minTableTextWidth(label: string) {
  return Math.max(64, label.length * 6.2 + 24);
}

function shapeDims(shape: TableShape, r: number, minTextWidth = 0) {
  switch (shape) {
    case "oval":
      return { w: Math.max(r * 2.5, minTextWidth), h: r * 1.5 };
    case "rectangle":
      return { w: Math.max(r * 2.6, minTextWidth), h: r * 1.5 };
    case "square": {
      // Grow both sides together so it stays a square rather than a wide rectangle.
      const d = Math.max(r * 1.8, minTextWidth);
      return { w: d, h: d };
    }
    default: {
      // Round tables: grow the diameter uniformly so a long name still yields a circle,
      // not an ellipse.
      const d = Math.max(r * 2, minTextWidth);
      return { w: d, h: d };
    }
  }
}

function shapeRadius(shape: TableShape) {
  switch (shape) {
    case "oval":
      return "50%";
    case "square":
      return "12px";
    case "rectangle":
      return "10px";
    default:
      return "100%";
  }
}

function computeLayout(tables: Table[], positionOverrides: Record<string, { x: number; y: number }> = {}) {
  const autoTables = tables.filter((t) => !positionOverrides[t.id]);

  // Precompute each table's footprint first (shape + capacity + how wide its name
  // needs it to be) so the auto-placement grid can be spaced to fit the biggest
  // one, rather than assuming every table is the same small size. Without this, a
  // table with a long custom name could end up wider than the fixed grid cell and
  // overlap its neighbor's name tag.
  const dims: Record<string, { r: number; w: number; h: number; seatR: number }> = {};
  let maxSeatR = 0;
  tables.forEach((t) => {
    const r = Math.min(58, 34 + t.capacity * 3.2);
    const { w, h } = shapeDims(t.shape, r, minTableTextWidth(t.label));
    const seatR = Math.max(w, h) / 2 + 34;
    dims[t.id] = { r, w, h, seatR };
    if (!positionOverrides[t.id]) maxSeatR = Math.max(maxSeatR, seatR);
  });

  const cols = Math.max(1, Math.ceil(Math.sqrt(autoTables.length || 1)));
  const cell = Math.max(250, maxSeatR * 2 + 40);
  const positions: Record<string, { cx: number; cy: number; r: number; w: number; h: number; seatR: number }> = {};
  let autoIdx = 0;
  let maxX = cell;
  let maxY = cell;
  tables.forEach((t) => {
    const { r, w, h, seatR } = dims[t.id];
    const override = positionOverrides[t.id];
    let cx: number, cy: number;
    if (override) {
      cx = override.x;
      cy = override.y;
    } else {
      const col = autoIdx % cols;
      const row = Math.floor(autoIdx / cols);
      cx = col * cell + cell / 2;
      cy = row * cell + cell / 2;
      autoIdx++;
    }
    positions[t.id] = { cx, cy, r, w, h, seatR };
    maxX = Math.max(maxX, cx + seatR + 20);
    maxY = Math.max(maxY, cy + seatR + 20);
  });
  const rows = Math.ceil(autoTables.length / cols);
  const gridHeight = Math.max(cell, rows * cell);
  return { positions, width: Math.max(cols * cell, maxX), height: Math.max(gridHeight, maxY) };
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

// Automatic, default group cohesion: every group's members are nudged toward
// (or, for "mixed" groups, away from) sitting at the same table without the
// user or the AI assistant needing to add a manual constraint for every pair.
// These are kept separate from explicit constraints (a lower cost weight in
// the solver, and never fed into the constraint checklist/violation UI) so an
// explicit user "cannot" always overrides the automatic default, and a large
// group that can't fully fit at one table doesn't show up as a false alarm.
function buildAutoGroupPairs(groups: Group[], guestsByGroupId: Record<string, string[]>): FlatPair[] {
  const pairs: FlatPair[] = [];
  groups.forEach((g) => {
    const memberIds = guestsByGroupId[g.id] || [];
    if (memberIds.length < 2) return;
    const type: "must" | "cannot" = g.seatingMode === "mixed" ? "cannot" : "must";
    memberIds.forEach((a) => {
      memberIds.forEach((b) => {
        if (a !== b) pairs.push({ parentId: `auto-${g.id}`, aId: a, bId: b, type, mode: "table" });
      });
    });
  });
  return pairs;
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
  fillMode: FillMode = "spread",
  previousAssignment: SeatAssignment = {},
  autoGroupPairs: FlatPair[] = []
): SeatAssignment {
  const n = seats.length;
  if (n === 0 || guestIds.length === 0) return {};

  const distinctTableIds = [...new Set(seats.map((s) => s.tableId))];
  const avgPerTable = distinctTableIds.length ? guestIds.length / distinctTableIds.length : 0;
  const spread = fillMode === "spread" && distinctTableIds.length > 1;

  // Only trust previous placements that are still valid: the guest must still
  // be in this seating (not removed) and the seat must still exist in this pool
  // (tables/capacities may have changed).
  const guestIdSet = new Set(guestIds);
  const prevSeatOfGuest: Record<string, string> = {};
  for (const [seatId, guestId] of Object.entries(previousAssignment)) {
    if (guestIdSet.has(guestId) && seatsById[seatId]) {
      prevSeatOfGuest[guestId] = seatId;
    }
  }
  const hasPrevious = Object.keys(prevSeatOfGuest).length > 0;

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
    // Automatic group cohesion: same idea, much lower weight, so it never
    // overrides an explicit user constraint but still meaningfully steers
    // placement by default (well above the spread/minimize-changes nudges).
    for (const p of autoGroupPairs) {
      const pa = guestPos[p.aId];
      const pb = guestPos[p.bId];
      if (pa === undefined || pb === undefined) continue;
      const sa = seats[pa];
      const sb = seats[pb];
      const linked = sa.tableId === sb.tableId;
      if (p.type === "must" && !linked) total += 3;
      if (p.type === "cannot" && linked) total += 3;
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
    if (hasPrevious) {
      // Soft penalty for drifting from the previous plan: a lot cheaper than any
      // constraint violation, so constraints always win, but enough to make the
      // solver prefer the layout closest to what was there before whenever a
      // few equally-valid options exist. Moving someone to a different table
      // costs more than moving them to a different seat at the same table.
      for (let i = 0; i < assign.length; i++) {
        const gid = assign[i];
        if (!gid) continue;
        const prevSeatId = prevSeatOfGuest[gid];
        if (!prevSeatId || prevSeatId === seats[i].id) continue;
        const prevSeat = seatsById[prevSeatId];
        total += prevSeat.tableId === seats[i].tableId ? 0.3 : 2;
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

  function warmInit() {
    const assign: (string | null)[] = new Array(n).fill(null);
    const guestPos: Record<string, number> = {};
    const seatIndexById: Record<string, number> = {};
    seats.forEach((s, i) => (seatIndexById[s.id] = i));

    const remainingGuests: string[] = [];
    guestIds.forEach((gid) => {
      const prevSeatId = prevSeatOfGuest[gid];
      const idx = prevSeatId ? seatIndexById[prevSeatId] : undefined;
      if (idx !== undefined && assign[idx] === null) {
        assign[idx] = gid;
        guestPos[gid] = idx;
      } else {
        remainingGuests.push(gid);
      }
    });

    const openSeats: number[] = [];
    for (let i = 0; i < n; i++) if (assign[i] === null) openSeats.push(i);
    for (let i = openSeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [openSeats[i], openSeats[j]] = [openSeats[j], openSeats[i]];
    }
    remainingGuests.forEach((gid, i) => {
      const seatPos = openSeats[i];
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
    const init = hasPrevious && r === 0 ? warmInit() : randomInit();
    let assign = init.assign;
    const guestPos = init.guestPos;
    let curCost = cost(assign, guestPos);
    const T0 = hasPrevious && r === 0 ? 3 : 8;
    let T = T0;
    for (let it = 0; it < iterations; it++) {
      T = T0 * Math.pow(0.0006, it / iterations);
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
// Header synonyms are broad on purpose: Partiful, The Knot, Bliss & Bone, and
// plain spreadsheets all use slightly different column names for the same thing.
const NAME_HEADERS = ["name", "guest", "guest name", "full name", "attendee", "attendee name", "guest full name"];
const FIRST_NAME_HEADERS = ["first name", "first", "given name"];
const LAST_NAME_HEADERS = ["last name", "last", "surname", "family name"];
const GROUP_HEADERS = ["group", "groups", "table group", "party", "category", "tag", "tags", "side", "household"];
const STATUS_HEADERS = ["rsvp", "rsvp status", "status", "response", "attending", "invite status"];
const EMAIL_HEADERS = ["email", "email address", "e-mail", "e-mail address"];
const MEAL_HEADERS = ["meal", "meal choice", "entree", "entree choice", "menu", "menu choice", "food choice", "meal selection"];
const NOT_ATTENDING_VALUES = [
  "declined",
  "decline",
  "not attending",
  "not going",
  "no",
  "cant go",
  "can't go",
  "cancelled",
  "canceled",
];
const ATTENDING_VALUES = ["yes", "attending", "confirmed", "going", "accepted", "accept", "y"];

function statusFromCell(cell: string): RsvpStatus | undefined {
  const v = cell.trim().toLowerCase();
  if (!v) return undefined;
  if (NOT_ATTENDING_VALUES.includes(v)) return "declined";
  if (ATTENDING_VALUES.includes(v)) return "attending";
  return "pending"; // recognized column, unrecognized value (e.g. "maybe", "tentative") — don't assume either way
}

function parseGuestRows(raw: unknown[][]) {
  const guests: {
    name: string;
    groupNames: string[];
    email?: string;
    rsvpStatus?: RsvpStatus;
    mealChoice?: string;
  }[] = [];
  const groupNamesFound = new Set<string>();
  let declinedCount = 0;
  let withRsvpData = 0;
  let withMealData = 0;
  if (!raw || raw.length === 0) return { guests, groupNamesFound, declinedCount, withRsvpData, withMealData };
  const header = (raw[0] || []).map((h) => String(h ?? "").trim().toLowerCase());
  const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));
  const firstIdx = header.findIndex((h) => FIRST_NAME_HEADERS.includes(h));
  const lastIdx = header.findIndex((h) => LAST_NAME_HEADERS.includes(h));
  const groupIdx = header.findIndex((h) => GROUP_HEADERS.includes(h));
  const statusIdx = header.findIndex((h) => STATUS_HEADERS.includes(h));
  const emailIdx = header.findIndex((h) => EMAIL_HEADERS.includes(h));
  const mealIdx = header.findIndex((h) => MEAL_HEADERS.includes(h));
  const hasHeader = nameIdx !== -1 || firstIdx !== -1 || lastIdx !== -1;
  const startRow = hasHeader ? 1 : 0;
  const nameCol = hasHeader ? nameIdx : 0;
  const groupCol = hasHeader ? groupIdx : raw[0] && raw[0].length > 1 ? 1 : -1;

  for (let i = startRow; i < raw.length; i++) {
    const row = raw[i] || [];
    let name: string;
    if (nameCol >= 0) {
      name = String(row[nameCol] ?? "").trim();
    } else {
      const first = firstIdx >= 0 ? String(row[firstIdx] ?? "").trim() : "";
      const last = lastIdx >= 0 ? String(row[lastIdx] ?? "").trim() : "";
      name = [first, last].filter(Boolean).join(" ");
    }
    if (!name) continue;

    let rsvpStatus: RsvpStatus | undefined;
    if (statusIdx >= 0) {
      rsvpStatus = statusFromCell(String(row[statusIdx] ?? ""));
      if (rsvpStatus) withRsvpData++;
      if (rsvpStatus === "declined") declinedCount++;
    }

    const email = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim().toLowerCase() || undefined : undefined;
    const mealChoice = mealIdx >= 0 ? String(row[mealIdx] ?? "").trim() || undefined : undefined;
    if (mealChoice) withMealData++;

    let groupNames: string[] = [];
    if (groupCol >= 0) {
      const cell = String(row[groupCol] ?? "").trim();
      if (cell) groupNames = cell.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
    }
    groupNames.forEach((gn) => groupNamesFound.add(gn));
    guests.push({ name, groupNames, email, rsvpStatus, mealChoice });
  }
  return { guests, groupNamesFound, declinedCount, withRsvpData, withMealData };
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
      aria-label={title}
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
export default function SeatingPlanner({
  eventId,
  initialName,
  initialData,
  role,
  members,
  initialEventDate,
  initialLocation,
  initialMaxCapacity,
}: SeatingPlannerProps) {
  const readOnly = role === "viewer";

  const [eventName, setEventName] = useState(initialName || "Untitled event");
  const [eventDate, setEventDate] = useState(initialEventDate ?? "");
  const [location, setLocation] = useState(initialLocation ?? "");
  const [maxCapacity, setMaxCapacity] = useState<number | "">(initialMaxCapacity ?? "");
  const [tab, setTab] = useState("setup");
  const [tableGroups, setTableGroups] = useState<TableGroup[]>(initialData?.tableGroups ?? []);
  const [guests, setGuests] = useState<Guest[]>(initialData?.guests ?? []);
  const [groups, setGroups] = useState<Group[]>(initialData?.groups ?? []);
  const [constraints, setConstraints] = useState<Constraint[]>(initialData?.constraints ?? []);
  const [seatAssignment, setSeatAssignment] = useState<SeatAssignment>(initialData?.seatAssignment ?? {});
  const [solving, setSolving] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const [seatingView, setSeatingView] = useState("map");
  const [highlightNotes, setHighlightNotes] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [hoveredGuest, setHoveredGuest] = useState<string | null>(null);
  const [newGuestName, setNewGuestName] = useState("");
  const [fillMode, setFillMode] = useState<FillMode>(initialData?.fillMode ?? "spread");
  const [minimizeChanges, setMinimizeChanges] = useState(true);
  const [activeTableIds, setActiveTableIds] = useState<Set<string> | null>(null);
  const [showAllTables, setShowAllTables] = useState(false);
  const [tableNameOverrides, setTableNameOverrides] = useState<Record<string, string>>(
    initialData?.tableNameOverrides ?? {}
  );
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number; y: number }>>(
    initialData?.tablePositions ?? {}
  );
  const [guestSearch, setGuestSearch] = useState("");
  const [compactGuestRows, setCompactGuestRows] = useState(false);
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const [dragTable, setDragTable] = useState<{ id: string; x: number; y: number } | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapCaptureRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

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
          event_date: eventDate || null,
          location: location || null,
          max_capacity: maxCapacity === "" ? null : maxCapacity,
          data: { tableGroups, guests, groups, constraints, seatAssignment, fillMode, tableNameOverrides, tablePositions },
          updated_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      setSaveStatus(error ? "error" : "saved");
    }, 800);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, eventDate, location, maxCapacity, tableGroups, guests, groups, constraints, seatAssignment, fillMode, tableNameOverrides, tablePositions]);

  const tables = useMemo(() => buildTables(tableGroups, tableNameOverrides), [tableGroups, tableNameOverrides]);
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
    if (!activeTableIds || showAllTables) return tables;
    return tables.filter((t) => activeTableIds.has(t.id) || occupiedTableIds.has(t.id));
  }, [tables, activeTableIds, showAllTables, occupiedTableIds]);

  const hiddenTableCount = tables.length - visibleTables.length;
  const layout = useMemo(() => computeLayout(visibleTables, tablePositions), [visibleTables, tablePositions]);

  const guestById = useMemo(() => Object.fromEntries(guests.map((g) => [g.id, g])), [guests]);
  const visibleGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.note ?? "").toLowerCase().includes(q) || (g.mealChoice ?? "").toLowerCase().includes(q)
    );
  }, [guests, guestSearch]);
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
    setActiveTableIds(null);
    setJustGenerated(false);
    setPicked(null);
  }
  function clearAllSeatsWithUndo() {
    if (readOnly || seatedCount === 0) return;
    const prevSeatAssignment = seatAssignment;
    const prevActiveTableIds = activeTableIds;
    const prevJustGenerated = justGenerated;
    clearAllSeats();
    pushUndo("Cleared all seats.", () => {
      setSeatAssignment(prevSeatAssignment);
      setActiveTableIds(prevActiveTableIds);
      setJustGenerated(prevJustGenerated);
    });
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
      const result = solveSeating(
        poolSeats,
        guests.map((g) => g.id),
        flatPairs,
        poolSeatsById,
        fillMode,
        minimizeChanges ? seatAssignment : {},
        autoGroupPairs
      );
      setSeatAssignment(result);
      setActiveTableIds(new Set(chosenIds));
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

  async function exportPdf() {
    if (!mapCaptureRef.current) return;
    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const canvas = await html2canvas(mapCaptureRef.current, { backgroundColor: "#FCFAF4", scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "pt", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${safeFileName()} - Seat Map.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
      window.alert(`Couldn't generate the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingPdf(false);
    }
  }

  // ---- conversational agent: apply a batch of proposed operations ----
  function applyAgentOperations(operations: AgentOperation[]): AgentApplyResult[] {
    if (readOnly) {
      return operations.map((_, index) => ({ index, ok: false, message: "You don't have edit access." }));
    }

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

    operations.forEach((op, index) => {
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
            const table = byName(buildTables(workingTableGroups, tableNameOverrides), (t) => t.label, op.tableLabel || "");
            if (!table) throw new Error(`Couldn't find table "${op.tableLabel}".`);
            const occupied = new Set(Object.keys(workingSeatAssignment));
            const freeSeat = buildSeats([table]).find((s) => !occupied.has(s.id));
            if (!freeSeat) throw new Error(`"${table.label}" is full.`);
            const next = { ...workingSeatAssignment };
            const fromSeatId = Object.keys(next).find((sid) => next[sid] === g.id);
            if (fromSeatId) delete next[fromSeatId];
            next[freeSeat.id] = g.id;
            workingSeatAssignment = next;
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
            setActiveTableIds(null);
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
                type: op.constraintType === "cannot" ? "cannot" : "must",
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
            const workingTables = buildTables(workingTableGroups);
            let poolTables = workingTables;
            if (fillMode === "consolidate") {
              const chosenIds = pickConsolidatedTables(workingTables, workingGuests.length);
              poolTables = workingTables.filter((t) => chosenIds.includes(t.id));
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
              minimizeChanges ? workingSeatAssignment : {},
              workingAutoGroupPairs
            );
            setActiveTableIds(new Set(poolTables.map((t) => t.id)));
            setShowAllTables(false);
            setJustGenerated(true);
            break;
          }
          default:
            throw new Error("Unknown operation.");
        }
        results.push({ index, ok: true });
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

    return results;
  }

  const seatsShort = totalSeats < guests.length;
  const capacityExceeded = maxCapacity !== "" && activeGuests.length > Number(maxCapacity);

  const PANE_ORDER = [
    { id: "setup", label: "Tables" },
    { id: "guests", label: "Guests & rules" },
    { id: "seating", label: "Seating map" },
    { id: "decor", label: "Decor ideas" },
  ] as const;
  const paneIndex = PANE_ORDER.findIndex((p) => p.id === tab);
  const prevPane = paneIndex > 0 ? PANE_ORDER[paneIndex - 1] : null;
  const nextPane = paneIndex >= 0 && paneIndex < PANE_ORDER.length - 1 ? PANE_ORDER[paneIndex + 1] : null;

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

        <div className="mb-4 flex flex-col gap-1.5 text-xs">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px]" style={{ color: C.muted }}>
              Date
            </span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={readOnly}
              className="px-1.5 py-1 rounded-md border text-xs bg-transparent outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px]" style={{ color: C.muted }}>
              Location
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={readOnly}
              placeholder="Venue, city…"
              className="px-1.5 py-1 rounded-md border text-xs bg-transparent outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px]" style={{ color: C.muted }}>
              Max capacity
            </span>
            <input
              type="number"
              min={0}
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={readOnly}
              placeholder="Optional"
              className="px-1.5 py-1 rounded-md border text-xs bg-transparent outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            />
          </label>
        </div>

        {[
          { id: "setup", label: "1. Tables", icon: Table2 },
          { id: "guests", label: "2. Guests & rules", icon: Users },
          { id: "seating", label: "3. Seating map", icon: LayoutGrid },
          { id: "decor", label: "4. Decor ideas", icon: Palette },
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
            <span style={{ color: capacityExceeded ? C.wine : C.muted }}>{guests.length}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Tables</span>
            <span>{tables.length}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Seats</span>
            <span style={{ color: seatsShort ? C.wine : C.muted }}>{totalSeats}</span>
          </div>
          {maxCapacity !== "" && (
            <div className="flex justify-between py-0.5">
              <span>Capacity</span>
              <span style={{ color: capacityExceeded ? C.wine : C.muted }}>
                {activeGuests.length}/{maxCapacity}
              </span>
            </div>
          )}
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
          { id: "setup", icon: Table2, label: "Tables" },
          { id: "guests", icon: Users, label: "Guests & rules" },
          { id: "seating", icon: LayoutGrid, label: "Seating map" },
          { id: "decor", icon: Palette, label: "Decor ideas" },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-label={t.label}
              aria-current={tab === t.id ? "page" : undefined}
              className="p-2 rounded-lg"
              style={{ color: tab === t.id ? C.gold : C.muted }}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      {/* main */}
      <main className="flex-1 p-6 sm:p-10 pb-36 sm:pb-10 overflow-auto">
        {/* mobile-only event name — the sidebar with the rename field is hidden below the sm breakpoint */}
        <div className="sm:hidden mb-6">
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            disabled={readOnly}
            className="w-full bg-transparent outline-none text-xl leading-tight"
            style={{ fontFamily: "Fraunces, serif", color: C.ink }}
          />
          <div className="mt-1 text-[10px]" style={{ color: C.muted }}>
            {readOnly ? "View only" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : saveStatus === "saved" ? "Saved" : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={readOnly}
              aria-label="Event date"
              className="px-2 py-1.5 rounded-lg border bg-transparent outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={readOnly}
              placeholder="Location"
              aria-label="Location"
              className="flex-1 min-w-[120px] px-2 py-1.5 rounded-lg border bg-transparent outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            />
            <input
              type="number"
              min={0}
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={readOnly}
              placeholder="Max capacity"
              aria-label="Max capacity"
              className="w-28 px-2 py-1.5 rounded-lg border bg-transparent outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            />
          </div>
        </div>

        {tab === "setup" && (
          <div className="max-w-2xl">
            <SectionTitle eyebrow="Step one" title="Configure your tables" />
            <p className="text-sm mb-6" style={{ color: C.muted }}>
              Define the table types available for this event — how many of each, and how many seats per table.
            </p>

            <div className="space-y-3">
              {tableGroups.map((g) => (
                <div key={g.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: C.card, borderColor: C.line }}>
                  <input
                    value={g.label}
                    onChange={(e) => updateTableGroup(g.id, { label: e.target.value })}
                    disabled={readOnly}
                    className="w-full sm:w-auto sm:flex-1 bg-transparent outline-none text-sm font-medium"
                    style={{ color: C.ink }}
                    placeholder="Table type name"
                  />
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }} title="Number of tables of this type">
                    <Table2 size={13} style={{ color: C.gold }} />
                    <input
                      type="number"
                      min={0}
                      value={g.count}
                      disabled={readOnly}
                      onChange={(e) => updateTableGroup(g.id, { count: e.target.value === "" ? "" : Number(e.target.value) })}
                      onBlur={() => {
                        if (g.count === "") updateTableGroup(g.id, { count: 0 });
                      }}
                      aria-label="Number of tables of this type"
                      className="w-14 px-2 py-1 rounded-md border text-sm text-center"
                      style={{ borderColor: C.line }}
                    />
                    tables
                  </label>
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }} title="Seats per table">
                    <Users size={13} style={{ color: C.gold }} />
                    <input
                      type="number"
                      min={0}
                      value={g.capacity}
                      disabled={readOnly}
                      onChange={(e) => updateTableGroup(g.id, { capacity: e.target.value === "" ? "" : Number(e.target.value) })}
                      onBlur={() => {
                        if (g.capacity === "") updateTableGroup(g.id, { capacity: 0 });
                      }}
                      aria-label="Seats per table"
                      className="w-14 px-2 py-1 rounded-md border text-sm text-center"
                      style={{ borderColor: C.line }}
                    />
                    seats each
                  </label>
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                    Shape
                    <select
                      value={g.shape || "round"}
                      disabled={readOnly}
                      onChange={(e) => updateTableGroup(g.id, { shape: e.target.value as TableShape })}
                      aria-label="Table shape"
                      className="px-2 py-1 rounded-md border text-sm"
                      style={{ borderColor: C.line, color: C.ink }}
                    >
                      <option value="round">Round</option>
                      <option value="oval">Oval</option>
                      <option value="square">Square</option>
                      <option value="rectangle">Rectangle</option>
                    </select>
                  </label>
                  <IconBtn danger title="Remove table type" onClick={() => removeTableGroupWithUndo(g.id)} disabled={readOnly}>
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

            {maxCapacity !== "" && (
              <div
                className="mt-3 p-4 rounded-xl text-sm flex items-center gap-2"
                style={{ backgroundColor: capacityExceeded ? "#F3E4E4" : "#EEF2EA", color: capacityExceeded ? C.wine : C.sage }}
              >
                {capacityExceeded ? <AlertTriangle size={16} /> : <Check size={16} />}
                {capacityExceeded
                  ? `${activeGuests.length} guests exceeds your venue's max capacity of ${maxCapacity}.`
                  : `${activeGuests.length} of ${maxCapacity} max capacity.`}
              </div>
            )}
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
                <button
                  onClick={() => setShowImportHelp((v) => !v)}
                  className="text-xs font-medium underline underline-offset-2"
                  style={{ color: C.muted }}
                >
                  {showImportHelp ? "Hide" : "Where do I get this file?"}
                </button>
              </div>

              {showImportHelp && (
                <div className="mb-3 p-3 rounded-lg text-xs leading-relaxed space-y-2" style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, color: C.ink }}>
                  <div>
                    <strong>Partiful:</strong> open your event → Guest List → tap "Export CSV" in the top right, then choose which RSVP statuses to include.
                  </div>
                  <div>
                    <strong>The Knot:</strong> go to your Guest List Manager → "Download List" → "Entire Guest List" to get a CSV. If the button doesn't respond, try it in Chrome.
                  </div>
                  <div>
                    <strong>Bliss &amp; Bone:</strong> from your dashboard, open your guest list / RSVP tracker and use the export option to download your RSVP data.
                  </div>
                  <div style={{ color: C.muted }}>
                    Any of these CSVs will import cleanly. If the file has an RSVP status column, SeatMe reads it — declined guests won't count toward your seating totals. If it has an email or meal/entree column, SeatMe picks that up too — use "Sync RSVPs" to update your existing guest list from a new export instead of starting over.
                  </div>
                </div>
              )}

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
                  {pendingImport.declinedCount > 0 && (
                    <> {pendingImport.declinedCount} marked as declined.</>
                  )}
                  {pendingImport.withRsvpData > 0 && (
                    <> {pendingImport.withRsvpData} row{pendingImport.withRsvpData === 1 ? "" : "s"} with an RSVP status.</>
                  )}
                  {pendingImport.withMealData > 0 && (
                    <> {pendingImport.withMealData} row{pendingImport.withMealData === 1 ? "" : "s"} with a meal choice.</>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {guests.length > 0 && (
                      <button onClick={() => confirmImport("sync")} className="px-2.5 py-1 rounded-md font-semibold" style={{ backgroundColor: C.sage, color: "#fff" }}>
                        Sync RSVPs
                      </button>
                    )}
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
                  {guests.length > 0 && (
                    <div className="mt-1.5" style={{ color: C.muted }}>
                      "Sync RSVPs" matches by email (or name) and updates existing guests without touching your seating — best for re-importing after an RSVP deadline.
                    </div>
                  )}
                </div>
              )}

              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {groups.map((gr) => {
                  const mixed = gr.seatingMode === "mixed";
                  return (
                    <div key={gr.id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs" style={{ backgroundColor: gr.color, color: "#fff" }}>
                      <input
                        value={gr.name}
                        onChange={(e) => renameGroup(gr.id, e.target.value)}
                        disabled={readOnly}
                        aria-label="Group name"
                        className="bg-transparent outline-none"
                        style={{ color: "#fff", width: `${Math.max(60, gr.name.length * 6.5)}px` }}
                      />
                      <button
                        onClick={() => toggleGroupSeatingMode(gr.id)}
                        disabled={readOnly}
                        title={
                          mixed
                            ? "Mixed — deliberately spread across tables. Click to seat together instead."
                            : "Seated together by default. Click to mix this group across tables instead."
                        }
                        aria-label={mixed ? `${gr.name}: mixed seating, click to seat together` : `${gr.name}: seated together, click to mix`}
                        className="p-0.5 rounded-full hover:bg-black/10 disabled:opacity-60"
                      >
                        {mixed ? <Shuffle size={10} /> : <Link2 size={10} />}
                      </button>
                      {!readOnly && (
                        <button
                          onClick={() => removeGroupWithUndo(gr.id)}
                          title="Remove group"
                          aria-label={`Remove group ${gr.name}`}
                          className="p-0.5 rounded-full hover:bg-black/10"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button onClick={addGroup} disabled={readOnly} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-40" style={{ color: C.gold, border: `1px dashed ${C.gold}` }}>
                  <Plus size={11} /> Group
                </button>
              </div>
              <div className="mb-3 text-[11px]" style={{ color: C.muted }}>
                <Link2 size={10} className="inline mr-1 -mt-0.5" /> together (default) · <Shuffle size={10} className="inline mr-1 -mt-0.5" /> mixed — click a group's icon to switch. Applied automatically on generate/regenerate.
              </div>

              {guests.length > 5 && (
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: C.line, backgroundColor: C.card }}>
                    <Search size={13} style={{ color: C.muted }} />
                    <input
                      value={guestSearch}
                      onChange={(e) => setGuestSearch(e.target.value)}
                      placeholder="Search guests…"
                      aria-label="Search guests"
                      className="flex-1 bg-transparent outline-none text-xs"
                      style={{ color: C.ink }}
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0" style={{ color: C.muted }}>
                    <input type="checkbox" checked={compactGuestRows} onChange={(e) => setCompactGuestRows(e.target.checked)} />
                    Compact view
                  </label>
                </div>
              )}

              <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
                {visibleGuests.length === 0 && (
                  <div className="px-3 py-3 text-xs" style={{ color: C.muted }}>
                    No guests match &quot;{guestSearch}&quot;.
                  </div>
                )}
                {visibleGuests.map((g) => (
                  <div key={g.id} className="px-3 py-2 border-b last:border-b-0" style={{ borderColor: C.line }}>
                    <div className="flex items-center gap-2">
                      <input
                        value={g.name}
                        onChange={(e) => renameGuest(g.id, e.target.value)}
                        disabled={readOnly}
                        aria-label="Guest name"
                        className="flex-1 bg-transparent outline-none text-sm"
                        style={{ color: C.ink, fontFamily: "Fraunces, serif" }}
                      />
                      <span className="text-[10px] shrink-0 whitespace-nowrap" style={{ color: seatOfGuest[g.id] ? C.sage : C.muted }}>
                        {seatOfGuest[g.id]
                          ? `Seated · ${tableById[seatsById[seatOfGuest[g.id]]?.tableId ?? ""]?.label ?? ""}`
                          : "Unseated"}
                      </span>
                      <IconBtn danger title="Remove guest" onClick={() => removeGuestWithUndo(g.id)} disabled={readOnly}>
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
                    {!compactGuestRows && (
                      <>
                        <div className="flex items-center gap-1.5 mt-1">
                          <StickyNote size={11} className="shrink-0" style={{ color: g.note ? C.gold : C.muted }} />
                          <input
                            value={g.note ?? ""}
                            onChange={(e) => updateGuestNote(g.id, e.target.value)}
                            disabled={readOnly}
                            placeholder="Dietary need, high chair, wheelchair access…"
                            className="flex-1 bg-transparent outline-none text-[11px]"
                            style={{ color: C.muted }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            onClick={() => cycleRsvpStatus(g.id)}
                            disabled={readOnly}
                            title="Click to change RSVP status"
                            className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 disabled:opacity-60"
                            style={{
                              borderColor:
                                g.rsvpStatus === "declined" ? C.wine : g.rsvpStatus === "attending" ? C.sage : C.line,
                              color:
                                g.rsvpStatus === "declined" ? C.wine : g.rsvpStatus === "attending" ? C.sage : C.muted,
                            }}
                          >
                            {g.rsvpStatus === "declined" ? "Declined" : g.rsvpStatus === "attending" ? "Attending" : "Pending"}
                          </button>
                          <input
                            value={g.mealChoice ?? ""}
                            onChange={(e) => updateGuestMealChoice(g.id, e.target.value)}
                            disabled={readOnly}
                            placeholder="Meal choice…"
                            className="flex-1 bg-transparent outline-none text-[11px]"
                            style={{ color: C.muted }}
                          />
                        </div>
                      </>
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
                        <IconBtn danger title="Remove rule" onClick={() => removeConstraintWithUndo(c.id)} disabled={readOnly}>
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
                <button
                  onClick={clearAllSeatsWithUndo}
                  disabled={readOnly || seatedCount === 0}
                  title="Unseat everyone and start the floor plan from scratch — keeps your guest list, groups, tables, and constraints"
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border disabled:opacity-40"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  <X size={14} /> Clear tables
                </button>
                {notedGuestCount > 0 && (
                  <button
                    onClick={() => setHighlightNotes((v) => !v)}
                    title="Highlight every seat with a note, and list them for a final sweep"
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border"
                    style={{
                      borderColor: highlightNotes ? C.gold : C.line,
                      color: highlightNotes ? "#fff" : C.ink,
                      backgroundColor: highlightNotes ? C.gold : C.card,
                    }}
                  >
                    <StickyNote size={14} /> Notes ({notedGuestCount})
                  </button>
                )}
                <details ref={exportMenuRef} className="relative">
                  <summary
                    className="list-none flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border cursor-pointer"
                    style={{ borderColor: C.line, color: C.ink }}
                  >
                    <Download size={14} /> Export
                  </summary>
                  <div
                    className="absolute right-0 mt-1 rounded-lg border shadow-lg overflow-hidden z-10"
                    style={{ borderColor: C.line, backgroundColor: C.card, minWidth: 180 }}
                  >
                    <button
                      onClick={() => {
                        exportExcel();
                        exportMenuRef.current?.removeAttribute("open");
                      }}
                      disabled={tables.length === 0}
                      title="Download the seating list as an Excel file"
                      className="flex items-center gap-1.5 w-full text-left px-3 py-2 text-sm disabled:opacity-40"
                      style={{ color: C.ink }}
                    >
                      <Download size={14} /> Excel (.xlsx)
                    </button>
                    <button
                      onClick={() => {
                        exportPdf();
                        exportMenuRef.current?.removeAttribute("open");
                      }}
                      disabled={tables.length === 0 || exportingPdf || seatingView !== "map"}
                      title={seatingView !== "map" ? "Switch to Map view to export a PDF" : "Download the seat map as a PDF"}
                      className="flex items-center gap-1.5 w-full text-left px-3 py-2 text-sm border-t disabled:opacity-40"
                      style={{ color: C.ink, borderColor: C.line }}
                    >
                      <FileImage size={14} /> {exportingPdf ? "Exporting…" : "PDF (seat map)"}
                    </button>
                  </div>
                </details>
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
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: C.muted }}>
                <input
                  type="checkbox"
                  checked={minimizeChanges}
                  disabled={readOnly}
                  onChange={(e) => setMinimizeChanges(e.target.checked)}
                />
                Keep close to current plan when regenerating
              </label>
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

            <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: C.ink }}>
              <Users size={15} style={{ color: C.gold }} />
              <span>
                <strong>{seatedCount}</strong> of {activeGuests.length} guest{activeGuests.length === 1 ? "" : "s"} seated
                {unseatedGuests.length > 0 && <span style={{ color: C.muted }}> · {unseatedGuests.length} unseated</span>}
                {notedGuestCount > 0 && (
                  <span style={{ color: C.muted }}>
                    {" "}
                    · {notedGuestCount} with note{notedGuestCount === 1 ? "" : "s"}
                  </span>
                )}
                {guests.length > activeGuests.length && (
                  <span style={{ color: C.muted }}>
                    {" "}
                    · {guests.length - activeGuests.length} declined
                  </span>
                )}
              </span>
            </div>

            {(groupStats.byGroup.length > 0 || groupStats.ungrouped.total > 0) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {groupStats.byGroup.map(({ group, total, seated }) => (
                  <div
                    key={group.id}
                    className="text-[11px] px-2 py-0.5 rounded-full border font-medium"
                    style={{ borderColor: group.color, color: group.color }}
                  >
                    {group.name}: {seated}/{total} seated
                  </div>
                ))}
                {groupStats.ungrouped.total > 0 && (
                  <div className="text-[11px] px-2 py-0.5 rounded-full border font-medium" style={{ borderColor: C.line, color: C.muted }}>
                    No group: {groupStats.ungrouped.seated}/{groupStats.ungrouped.total} seated
                  </div>
                )}
              </div>
            )}

            {mealStats.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                {mealStats.map(({ choice, count }) => (
                  <div
                    key={choice}
                    className="text-[11px] px-2 py-0.5 rounded-full border font-medium"
                    style={{ borderColor: C.line, color: C.ink }}
                  >
                    {choice}: {count}
                  </div>
                ))}
              </div>
            )}

            {highlightNotes && notedGuests.length > 0 && (
              <div className="mb-5 p-3 rounded-xl text-sm" style={{ backgroundColor: C.goldSoft, color: C.ink }}>
                <div className="flex items-center gap-2 font-semibold mb-1.5" style={{ color: C.gold }}>
                  <StickyNote size={16} />
                  {notedGuests.length} guest{notedGuests.length === 1 ? "" : "s"} with a note — highlighted on the map below
                </div>
                <ul className="space-y-1 pl-1">
                  {notedGuests.map((g) => (
                    <li key={g.id}>
                      <strong style={{ fontFamily: "Fraunces, serif" }}>{g.name}</strong>
                      {seatOfGuest[g.id] ? ` (${tableById[seatsById[seatOfGuest[g.id]]?.tableId ?? ""]?.label ?? ""})` : " (unseated)"}
                      : {g.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {underfilledTables.length > 0 && (
              <div className="mb-5 p-3 rounded-xl text-sm" style={{ backgroundColor: "#FBF3E4", color: C.ink }}>
                <div className="flex items-center gap-2 font-semibold" style={{ color: C.gold }}>
                  <AlertTriangle size={16} />
                  {underfilledTables.length} table{underfilledTables.length === 1 ? "" : "s"} under half full
                </div>
                <ul className="mt-1.5 space-y-1 pl-1">
                  {underfilledTables.map(({ table, occupied }) => (
                    <li key={table.id}>
                      <strong>{table.label}</strong>: {occupied}/{table.capacity} seated — move guests here from a fuller table, or shrink/remove this table type in Step 1.
                    </li>
                  ))}
                </ul>
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePoolClick(g.id);
                        }
                      }}
                      role="button"
                      tabIndex={readOnly ? -1 : 0}
                      aria-pressed={picked === g.id}
                      title={g.note || undefined}
                      className="px-3 py-1.5 rounded-lg text-sm cursor-pointer border select-none flex items-center gap-1.5"
                      style={{
                        fontFamily: "Fraunces, serif",
                        backgroundColor: picked === g.id ? C.gold : C.card,
                        color: picked === g.id ? "#fff" : C.ink,
                        borderColor: C.goldSoft,
                      }}
                    >
                      {g.name}
                      {g.note && (
                        <StickyNote size={11} style={{ color: picked === g.id ? "#fff" : C.gold }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seatingView === "map" && (
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]" style={{ color: C.muted }}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block rounded" style={{ width: 14, height: 10, border: `1.5px dashed ${C.line}` }} />
                  Empty
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block rounded" style={{ width: 14, height: 10, border: `1.5px solid ${C.gold}`, backgroundColor: "#fff" }} />
                  Seated
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block rounded" style={{ width: 14, height: 10, border: `1.5px solid ${C.wine}`, backgroundColor: "#fff" }} />
                  Rule conflict
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block rounded-full" style={{ width: 7, height: 7, backgroundColor: "#000" }} />
                  Has a note
                </span>
                {groups.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block rounded-full" style={{ width: 7, height: 7, backgroundColor: C.muted }} />
                    Group color
                  </span>
                )}
              </div>
            )}

            {seatingView === "map" ? (
              <div className="relative rounded-2xl border p-6 overflow-auto" style={{ borderColor: C.line, backgroundColor: "#FCFAF4" }} onDragOver={(e) => e.preventDefault()}>
                <div ref={mapCaptureRef} className="relative" style={{ width: layout.width, height: layout.height, minWidth: layout.width }}>
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
                    const basePos = layout.positions[t.id];
                    const pos = dragTable && dragTable.id === t.id ? { ...basePos, cx: dragTable.x, cy: dragTable.y } : basePos;
                    const beginTableDrag = (startClientX: number, startClientY: number) => {
                      const startX = basePos.cx;
                      const startY = basePos.cy;
                      const minCoord = basePos.seatR + 10;
                      const compute = (clientX: number, clientY: number) => ({
                        x: Math.max(minCoord, startX + (clientX - startClientX)),
                        y: Math.max(minCoord, startY + (clientY - startClientY)),
                      });
                      const onMouseMove = (ev: MouseEvent) => setDragTable({ id: t.id, ...compute(ev.clientX, ev.clientY) });
                      const onMouseUp = (ev: MouseEvent) => {
                        const p = compute(ev.clientX, ev.clientY);
                        moveTable(t.id, p.x, p.y);
                        cleanup();
                      };
                      const onTouchMove = (ev: TouchEvent) => {
                        const touch = ev.touches[0];
                        if (!touch) return;
                        ev.preventDefault();
                        setDragTable({ id: t.id, ...compute(touch.clientX, touch.clientY) });
                      };
                      const onTouchEnd = (ev: TouchEvent) => {
                        const touch = ev.changedTouches[0];
                        if (touch) {
                          const p = compute(touch.clientX, touch.clientY);
                          moveTable(t.id, p.x, p.y);
                        }
                        cleanup();
                      };
                      function cleanup() {
                        setDragTable(null);
                        window.removeEventListener("mousemove", onMouseMove);
                        window.removeEventListener("mouseup", onMouseUp);
                        window.removeEventListener("touchmove", onTouchMove);
                        window.removeEventListener("touchend", onTouchEnd);
                      }
                      window.addEventListener("mousemove", onMouseMove);
                      window.addEventListener("mouseup", onMouseUp);
                      window.addEventListener("touchmove", onTouchMove, { passive: false });
                      window.addEventListener("touchend", onTouchEnd);
                    };
                    const startTableDrag = (e: React.MouseEvent) => {
                      if (readOnly) return;
                      e.preventDefault();
                      beginTableDrag(e.clientX, e.clientY);
                    };
                    const startTableDragTouch = (e: React.TouchEvent) => {
                      if (readOnly) return;
                      const touch = e.touches[0];
                      if (!touch) return;
                      beginTableDrag(touch.clientX, touch.clientY);
                    };
                    return (
                      <div key={t.id}>
                        <div
                          onMouseDown={startTableDrag}
                          onTouchStart={startTableDragTouch}
                          className="absolute border-2 flex items-center justify-center text-center px-2"
                          style={{
                            left: pos.cx - pos.w / 2,
                            top: pos.cy - pos.h / 2,
                            width: pos.w,
                            height: pos.h,
                            borderRadius: shapeRadius(t.shape),
                            borderColor: C.goldSoft,
                            backgroundColor: "#fff",
                            cursor: readOnly ? "default" : "move",
                            touchAction: "none",
                          }}
                        >
                          <input
                            value={tableNameOverrides[t.id] ?? t.label}
                            onChange={(e) => renameTable(t.id, e.target.value)}
                            onBlur={(e) => {
                              if (e.target.value.trim().length === 0) {
                                setTableNameOverrides((m) => {
                                  const next = { ...m };
                                  delete next[t.id];
                                  return next;
                                });
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            disabled={readOnly}
                            title="Click to rename this table"
                            className="text-[11px] font-medium leading-tight text-center bg-transparent outline-none w-full"
                            style={{ color: C.muted, fontFamily: "Inter, sans-serif" }}
                          />
                        </div>
                        {Array.from({ length: t.capacity }).map((_, i) => {
                          const seatId = `${t.id}#${i}`;
                          const angle = -Math.PI / 2 + (2 * Math.PI * i) / t.capacity;
                          const x = pos.cx + pos.seatR * Math.cos(angle);
                          const y = pos.cy + pos.seatR * Math.sin(angle);
                          const guestId = seatAssignment[seatId];
                          const guest = guestId ? guestById[guestId] : null;
                          const guestName = guest?.name ?? null;
                          const guestNote = guest?.note ?? null;
                          const guestGroupColor = guest?.groupIds?.map((gid) => groupById[gid]?.color).find(Boolean) ?? null;
                          const hasViolation = flatViolations.some((v) => v.status === "violated" && (v.seatA === seatId || v.seatB === seatId));
                          const emphasizeNote = highlightNotes && !!guestNote;
                          return (
                            <div
                              key={seatId}
                              onClick={() => handleSeatClick(seatId)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleSeatClick(seatId);
                                }
                              }}
                              role="button"
                              tabIndex={readOnly ? -1 : 0}
                              aria-label={guestName ? (guestNote ? `${guestName} — ${guestNote}` : guestName) : "Empty seat"}
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
                                border: `${emphasizeNote ? 2.5 : 1.5}px solid ${hasViolation ? C.wine : guestId ? C.gold : C.line}`,
                                backgroundColor: picked === guestId ? C.gold : emphasizeNote ? C.goldSoft : guestId ? "#fff" : "transparent",
                                borderStyle: guestId ? "solid" : "dashed",
                                boxShadow: emphasizeNote ? `0 0 0 2px ${C.goldSoft}` : "none",
                              }}
                              title={guestName ? (guestNote ? `${guestName} — ${guestNote}` : guestName) : "Empty seat"}
                            >
                              {guestGroupColor && (
                                <span
                                  className="absolute rounded-full"
                                  style={{
                                    bottom: -3,
                                    left: -3,
                                    width: 7,
                                    height: 7,
                                    backgroundColor: guestGroupColor,
                                    border: "1px solid #fff",
                                  }}
                                />
                              )}
                              {guestNote && (
                                <span
                                  className="absolute rounded-full"
                                  style={{
                                    top: -3,
                                    right: -3,
                                    width: 7,
                                    height: 7,
                                    backgroundColor: picked === guestId ? "#fff" : "#000",
                                    border: `1px solid ${picked === guestId ? "#000" : "#fff"}`,
                                  }}
                                />
                              )}
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

        {tab === "decor" && <DecorPanel eventId={eventId} readOnly={readOnly} />}

        {(prevPane || nextPane) && (
          <div className="flex items-center justify-between gap-3 mt-10 pt-6 border-t" style={{ borderColor: C.line }}>
            {prevPane ? (
              <button
                onClick={() => setTab(prevPane.id)}
                className="text-sm font-medium px-3 py-2 rounded-lg border"
                style={{ borderColor: C.line, color: C.ink }}
              >
                ← {prevPane.label}
              </button>
            ) : (
              <span />
            )}
            {nextPane && (
              <button
                onClick={() => setTab(nextPane.id)}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ backgroundColor: C.gold, color: "#fff" }}
              >
                Next: {nextPane.label} →
              </button>
            )}
          </div>
        )}
      </main>

      {undo && (
        <div
          className="fixed z-40 left-4 right-24 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bottom-20 sm:bottom-6 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl shadow-lg"
          style={{ backgroundColor: C.ink, color: C.paper, maxWidth: 420 }}
        >
          <span className="text-sm">{undo.message}</span>
          <button
            onClick={performUndo}
            className="flex items-center gap-1.5 text-sm font-semibold shrink-0"
            style={{ color: C.goldSoft }}
          >
            <Undo2 size={14} /> Undo
          </button>
        </div>
      )}

      <AgentChat
        eventId={eventId}
        role={role}
        getState={() => ({ tableGroups, guests, groups, constraints, seatAssignment, fillMode, tableNameOverrides })}
        onApply={applyAgentOperations}
      />
    </div>
  );
}
