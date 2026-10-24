// Planner data types and constants, plus merging guests' RSVPs into an open planner.
// Moved out of components/SeatingPlanner.tsx (2026-10-24); pure logic, no React.
import { C } from "@/lib/theme";

export const GROUP_COLORS = ["#A8823C", "#54704F", "#4A6FA5", "#8C3B3B", "#7A5C8E", "#B0562F"];

// ---------- types ----------
export type TableShape = "round" | "oval" | "square" | "rectangle";
export interface TableGroup {
  id: string;
  label: string;
  count: number | "";
  capacity: number | "";
  shape?: TableShape;
  // Square/rectangle only — how many seats sit at each short end. Both default to 1
  // (a single head, a single foot) to match how every table worked before this existed.
  headCount?: number | "";
  footCount?: number | "";
  // Purely visual — how much bigger/smaller than the auto-computed size this table
  // renders, independent of its seat count. 1 = default size. Set by dragging a
  // table's edge on the map (see beginTableResize below).
  sizeScale?: number;
}
export type FixtureType = "danceFloor" | "bar" | "stage";
export interface Fixture {
  id: string;
  type: FixtureType;
  label?: string;
  // Legacy (pre width/height): uniform bigger/smaller multiplier on the auto size.
  sizeScale?: number;
  // Exact size in metres, set by dragging the fixture's handles or typing it in.
  // Unset = auto size (dance floor follows the guest count).
  wM?: number;
  hM?: number;
  // Rotation in degrees, clockwise (0 = as added).
  rot?: number;
}
export const FIXTURE_DEFAULTS: Record<FixtureType, { label: string; fill: string; border: string }> = {
  danceFloor: { label: "Dance floor", fill: "#E8EFE4", border: C.sage },
  bar: { label: "Bar", fill: C.goldSoft, border: C.gold },
  stage: { label: "Stage / band", fill: "#F1E3E3", border: C.wine },
};

// Floor-plan scale: a standard 8-10 seat round table (60", ~1.5 m across) is drawn
// 116 px wide at layout scale 1, so 1 m ≈ 76 px. Fixtures use the same scale so
// they sit in true proportion to the tables instead of looking like toys.
export const PX_PER_M = 76;

// Real-world size of a fixture in metres, before any manual Bigger/Smaller.
//  - Dance floor: ~0.19 m² per guest — 40-50% of wedding guests dancing at once at
//    ~4.5 sq ft each (100 guests ≈ 15×15 ft). Min 3 m square, max 10 m.
//  - Bar: a 12 ft two-bartender bar, 3.6 × 0.9 m.
//  - Stage / band: ~150 sq ft band area, 4.8 × 3 m.
export function autoFixtureSizeM(type: FixtureType, guestCount: number) {
  if (type === "danceFloor") {
    const side = Math.max(3, Math.min(10, Math.sqrt(Math.max(0, guestCount) * 0.19)));
    return { w: side * 1.1, h: side / 1.1 };
  }
  if (type === "bar") return { w: 3.6, h: 0.9 };
  return { w: 4.8, h: 3 };
}
// The size a fixture is actually drawn at, in metres.
export function fixtureSizeM(f: Fixture, guestCount: number) {
  if (f.wM && f.hM) return { w: f.wM, h: f.hM };
  const auto = autoFixtureSizeM(f.type, guestCount);
  const k = f.sizeScale || 1;
  return { w: auto.w * k, h: auto.h * k };
}
export const FIXTURE_MIN_M = 0.5;
export const FIXTURE_MAX_M = 40;
export const roundM = (m: number) => Math.round(Math.max(FIXTURE_MIN_M, Math.min(FIXTURE_MAX_M, m)) * 10) / 10;
export const formatM = (m: number) => (Math.round(m * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

export type RsvpStatus = "attending" | "pending" | "declined";
export interface Guest {
  id: string;
  name: string;
  groupIds: string[];
  note?: string;
  email?: string;
  rsvpStatus?: RsvpStatus;
  mealChoice?: string;
  // Per-course selections from a structured guest RSVP submission (course id ->
  // chosen option), when the event's RSVP form has courses configured. `mealChoice`
  // above stays the single combined display string derived from this on submit —
  // this is the authoritative source for re-populating the RSVP form on edit.
  mealChoices?: Record<string, string>;
  // The guest's own comment from the public RSVP form. Kept apart from `note`
  // (the planner's private note), which guests never see or overwrite.
  rsvpComment?: string;
}
export type GroupSeatingMode = "together" | "mixed";
export interface Group {
  id: string;
  name: string;
  color: string;
  // Undefined means "together" — the default, and what most people mean when
  // they tag a group at all. "mixed" is an explicit opt-in to deliberately
  // spread that group's members across different tables instead.
  seatingMode?: GroupSeatingMode;
}
export interface Constraint {
  id: string;
  aType: "guest" | "group";
  aId: string;
  bType: "guest" | "group";
  bId: string;
  type: RuleType;
}
// "must" = sit together (side by side for two guests, same table for groups);
// "cannot" = not at the same table; "notNextTo" = may share a table, never side by side.
export type RuleType = "must" | "cannot" | "notNextTo";
export const RULE_SHORT: Record<RuleType, string> = { must: "with", cannot: "not with", notNextTo: "not next to" };
export type SeatAssignment = Record<string, string>;
export type FillMode = "consolidate" | "spread";
export type Role = "owner" | "editor" | "viewer";

export interface Member {
  email: string;
  role: string;
}

export interface FloorPlan {
  path: string;
  name: string;
}

export interface MenuCourse {
  id: string;
  name: string;
  options: string[];
}

export interface RsvpConfig {
  collectComments?: boolean;
  courses?: MenuCourse[];
  mealOptions?: string[]; // legacy, pre-courses — see the courses state init below
}

export interface PlannerData {
  // Event type picked when the event was created (lib/eventPresets.ts), kept for later features.
  eventType?: string;
  tableGroups?: TableGroup[];
  guests?: Guest[];
  groups?: Group[];
  constraints?: Constraint[];
  seatAssignment?: SeatAssignment;
  fillMode?: FillMode;
  tableNameOverrides?: Record<string, string>;
  tablePositions?: Record<string, { x: number; y: number }>;
  // Individual tables taken off the floor plan (e.g. "Round 7" of a group of 10)
  // without changing the group's count — so they can be added back exactly as
  // they were, same name and position.
  deletedTableIds?: string[];
  // Per-table rotation in degrees (clockwise), keyed by table id.
  tableRotations?: Record<string, number>;
  // Empty tables that auto-generate left out ("unused tables"), hidden from the
  // map until someone is seated there. Saved so they stay hidden after a reload.
  hiddenTableIds?: string[];
  floorPlan?: FloorPlan | null;
  fixtures?: Fixture[];
  fixturePositions?: Record<string, { x: number; y: number }>;
  posterTemplate?: string; // legacy, pre-split — see migrateLegacyPosterTemplate
  posterLayout?: string;
  posterPalette?: string;
  posterFont?: string;
  rsvpConfig?: RsvpConfig;
}

export interface SeatingPlannerProps {
  eventId: string;
  initialName: string;
  initialData: PlannerData | null;
  role: Role;
  members: Member[];
  initialEventDate?: string | null;
  initialLocation?: string | null;
  initialMaxCapacity?: number | null;
  initialRsvpEnabled?: boolean;
  /** The event's updated_at when the page loaded, for detecting newer saves. */
  initialUpdatedAt?: string | null;
}

// ---------- RSVP merge (autosave conflicts) ----------
// Fields a guest can change from the public RSVP page while the planner is open.
export const RSVP_FIELDS = ["rsvpStatus", "mealChoice", "mealChoices", "rsvpComment"] as const;

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// When an autosave finds the event was saved elsewhere since this planner last
// synced (usually a guest RSVP), carry over any RSVP fields that changed on the
// server since `base` (the last version this planner saved or loaded) into the
// local guest list. Everything else stays as edited locally. Returns the
// merged guests and the ids of guests who newly declined (to unseat them).
export function mergeRemoteRsvps(local: Guest[], base: Guest[], remote: Guest[]) {
  const baseById = new Map(base.map((g) => [g.id, g]));
  const remoteById = new Map(remote.map((g) => [g.id, g]));
  const newlyDeclined: string[] = [];
  let changed = false;
  const guests = local.map((g) => {
    const r = remoteById.get(g.id);
    if (!r) return g;
    const b = baseById.get(g.id);
    let next = g;
    for (const field of RSVP_FIELDS) {
      if (!sameValue(r[field], b?.[field]) && !sameValue(r[field], g[field])) {
        next = { ...next, [field]: r[field] } as Guest;
        changed = true;
      }
    }
    if (next.rsvpStatus === "declined" && g.rsvpStatus !== "declined") newlyDeclined.push(g.id);
    return next;
  });
  return { guests, newlyDeclined, changed };
}
