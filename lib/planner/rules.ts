// Seating rules (must / cannot / not next to) and the seating solver.
// Moved out of components/SeatingPlanner.tsx (2026-10-24); pure logic, no React.
import { Constraint, FillMode, Group, SeatAssignment } from "./types";
import { Seat, Table, areAdjacent } from "./layout";

// ---------- constraint expansion (groups -> flat guest pairs) ----------
export interface FlatPair {
  parentId: string;
  aId: string;
  bId: string;
  type: "must" | "cannot";
  mode: "table" | "adjacent";
}
export interface FlatViolation extends FlatPair {
  status: "unseated" | "satisfied" | "violated";
  seatA?: string;
  seatB?: string;
}

export function expandConstraint(c: Constraint, guestsByGroupId: Record<string, string[]>): FlatPair[] {
  const sideIds = (type: "guest" | "group", id: string) =>
    type === "group" ? guestsByGroupId[id] || [] : id ? [id] : [];
  // "must" between two individual guests means side by side (same table when a
  // group is involved); "cannot" always means not at the same table; "notNextTo"
  // allows the same table but never side by side.
  const mode: "table" | "adjacent" =
    c.type === "notNextTo"
      ? "adjacent"
      : c.type === "cannot" || c.aType === "group" || c.bType === "group"
        ? "table"
        : "adjacent";
  const type: "must" | "cannot" = c.type === "must" ? "must" : "cannot";
  const asIds = sideIds(c.aType, c.aId);
  const bsIds = sideIds(c.bType, c.bId);
  const pairs: FlatPair[] = [];
  asIds.forEach((a) => {
    bsIds.forEach((b) => {
      if (a !== b) pairs.push({ parentId: c.id, aId: a, bId: b, type, mode });
    });
  });
  return pairs;
}

export function expandAllConstraints(constraints: Constraint[], guestsByGroupId: Record<string, string[]>) {
  return constraints.flatMap((c) => expandConstraint(c, guestsByGroupId));
}

// Automatic, default group cohesion: every group's members are nudged toward
// (or, for "mixed" groups, away from) sitting at the same table without the
// user or the AI assistant needing to add a manual constraint for every pair.
// These are kept separate from explicit constraints (a lower cost weight in
// the solver, and never fed into the constraint checklist/violation UI) so an
// explicit user "cannot" always overrides the automatic default, and a large
// group that can't fully fit at one table doesn't show up as a false alarm.
export function buildAutoGroupPairs(groups: Group[], guestsByGroupId: Record<string, string[]>): FlatPair[] {
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
export function computeFlatViolations(
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
    // Shrinking a table's seat count removes seats before the cleanup effect
    // prunes assignments to them, so for one render a guest can point at a
    // seat that no longer exists. Treat them as unseated rather than crash.
    if (!sa || !sb) return { ...p, status: "unseated" as const };
    const sameTable = sa.tableId === sb.tableId;
    const linked = p.mode === "table" ? sameTable : sameTable && areAdjacent(sa.seatIdx, sb.seatIdx, sa.capacity);
    const ok = p.type === "must" ? linked : !linked;
    return { ...p, status: ok ? ("satisfied" as const) : ("violated" as const), seatA, seatB };
  });
}

export function aggregateConstraintStatus(constraints: Constraint[], flatViolations: FlatViolation[]) {
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
export function solveSeating(
  seats: Seat[],
  guestIds: string[],
  flatPairs: FlatPair[],
  seatsById: Record<string, Seat>,
  fillMode: FillMode = "spread",
  previousAssignment: SeatAssignment = {},
  autoGroupPairs: FlatPair[] = [],
  // Guests who must end up in one of a given set of seats — e.g. someone the
  // assistant was just told to put at the head table. They can still move
  // between those seats (to satisfy a "not next to" rule, say) but never
  // leave them. Weighted far above any rule so a pin always wins.
  pinnedSeatsOfGuest: Record<string, string[]> = {}
): SeatAssignment {
  const n = seats.length;
  if (n === 0 || guestIds.length === 0) return {};
  const pinnedSets: Record<string, Set<string>> = {};
  for (const [gid, sids] of Object.entries(pinnedSeatsOfGuest)) {
    if (sids.length) pinnedSets[gid] = new Set(sids);
  }
  const hasPins = Object.keys(pinnedSets).length > 0;

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
    if (hasPins) {
      for (const [gid, allowed] of Object.entries(pinnedSets)) {
        const pos = guestPos[gid];
        if (pos === undefined || !allowed.has(seats[pos].id)) total += 100;
      }
    }
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

export function pickConsolidatedTables(tables: Table[], guestCount: number) {
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
