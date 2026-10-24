// Table and seat geometry, and the floor-plan auto-layout.
// Moved out of components/SeatingPlanner.tsx (2026-10-24); pure logic, no React.
import { TableGroup, TableShape } from "./types";

// ---------- geometry helpers ----------
export interface Table {
  id: string;
  groupId: string;
  label: string;
  capacity: number;
  shape: TableShape;
  headCount: number;
  footCount: number;
  sizeScale: number;
}
export interface Seat {
  id: string;
  tableId: string;
  seatIdx: number;
  capacity: number;
}

export function buildTables(tableGroups: TableGroup[], nameOverrides: Record<string, string> = {}): Table[] {
  const tables: Table[] = [];
  tableGroups.forEach((g) => {
    const count = Number(g.count) > 0 ? Number(g.count) : 1;
    const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : 1;
    for (let i = 0; i < count; i++) {
      const id = `${g.id}-${i}`;
      const autoLabel = count > 1 ? `${g.label} ${i + 1}` : g.label;
      const override = nameOverrides[id];
      const headCount = Number(g.headCount) > 0 ? Number(g.headCount) : 1;
      const footCount = Number(g.footCount) > 0 ? Number(g.footCount) : 1;
      const sizeScale = Number(g.sizeScale) > 0 ? Number(g.sizeScale) : 1;
      tables.push({
        id,
        groupId: g.id,
        label: override && override.trim().length > 0 ? override : autoLabel,
        capacity,
        shape: g.shape || "round",
        headCount,
        footCount,
        sizeScale,
      });
    }
  });
  return tables;
}

export function buildSeats(tables: Table[]): Seat[] {
  const seats: Seat[] = [];
  tables.forEach((t) => {
    for (let i = 0; i < t.capacity; i++) {
      seats.push({ id: `${t.id}#${i}`, tableId: t.id, seatIdx: i, capacity: t.capacity });
    }
  });
  return seats;
}

export function areAdjacent(i: number, j: number, n: number) {
  if (n < 2) return false;
  const d = Math.abs(i - j);
  return d === 1 || d === n - 1;
}

// Rough px-per-character estimate for the 11px table-name input, plus room for
// the box's own horizontal padding — used to grow tables so a long custom name
// (e.g. "The Smith-Jones Family") gets space instead of clipping or, worse,
// forcing tables close enough together that neighboring name tags overlap.
export function minTableTextWidth(label: string) {
  return Math.max(64, label.length * 6.2 + 24);
}

export function shapeDims(shape: TableShape, r: number, minTextWidth = 0) {
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

export function shapeRadius(shape: TableShape) {
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

// Square/rectangle tables get exactly one seat at each short end — the "head" (index 0)
// and "foot" (the other end). You assign a guest to the head the same way as any other
// seat (click/drag), it's just always index 0 so it's a stable, labelable position. The
// rest of the capacity splits evenly between the two long sides. Side seats use a
// (k)/(count+1) spacing so they're evenly spread but never land exactly on a corner.
// Square/rectangle seat layout: `headCount` seats at the near short end, `footCount` at
// the far short end (both default to 1 — a single head, a single foot, exactly how this
// worked before either was configurable), and the remaining seats split evenly along the
// two long sides. Index order is head(s), top side seats, foot(s), bottom side seats —
// deliberately reproducing the original head=0/foot=1+topCount layout bit-for-bit when
// headCount=footCount=1, so no existing saved seating plan visually reshuffles.
export function rectSeatRoles(n: number, headCount = 1, footCount = 1) {
  if (n <= 0) return { headIdxs: [] as number[], sideTopIdxs: [] as number[], footIdxs: [] as number[], sideBottomIdxs: [] as number[] };
  const hc = Math.max(0, Math.min(headCount, n));
  const fc = Math.max(0, Math.min(footCount, n - hc));
  const sideCount = n - hc - fc;
  const topCount = Math.ceil(sideCount / 2);
  const bottomCount = sideCount - topCount;
  const headIdxs = Array.from({ length: hc }, (_, k) => k);
  const sideTopIdxs = Array.from({ length: topCount }, (_, k) => hc + k);
  const footIdxs = Array.from({ length: fc }, (_, k) => hc + topCount + k);
  const sideBottomIdxs = Array.from({ length: bottomCount }, (_, k) => hc + topCount + fc + k);
  return { headIdxs, sideTopIdxs, footIdxs, sideBottomIdxs };
}

// Spreads `c` seats evenly along a short edge of half-length `rh`, inset from the corners
// (same frac = (k+1)/(c+1) approach used for the long sides). A single seat centers at 0,
// matching the original always-centered head/foot seat exactly.
export function edgeSpread(k: number, c: number, rh: number): number {
  if (c <= 1) return 0;
  const frac = (k + 1) / (c + 1);
  return -rh + frac * (2 * rh);
}

export function rectSeatOffset(rw: number, rh: number, i: number, n: number, headCount = 1, footCount = 1) {
  const { headIdxs, sideTopIdxs, footIdxs, sideBottomIdxs } = rectSeatRoles(n, headCount, footCount);
  const hPos = headIdxs.indexOf(i);
  if (hPos !== -1) return { dx: -rw, dy: edgeSpread(hPos, headIdxs.length, rh) };
  const fPos = footIdxs.indexOf(i);
  if (fPos !== -1) return { dx: rw, dy: edgeSpread(fPos, footIdxs.length, rh) };
  const tPos = sideTopIdxs.indexOf(i);
  if (tPos !== -1) {
    const frac = (tPos + 1) / (sideTopIdxs.length + 1);
    return { dx: -rw + frac * (2 * rw), dy: -rh };
  }
  const bPos = sideBottomIdxs.indexOf(i);
  const frac = (bPos + 1) / (sideBottomIdxs.length + 1);
  return { dx: rw - frac * (2 * rw), dy: rh };
}

// Where seat i of n sits around a table, as an offset from the table's center. Round and
// oval tables use an elliptical ring (matching each shape's actual w/h, so an oval's short
// axis doesn't leave seats floating far from the table edge). Square and rectangle tables
// use the head/foot/sides layout above instead of a ring — guests at a rectangular table
// sit along its straight sides in real life, not in a circle floating around it.
export function seatOffset(shape: TableShape, w: number, h: number, i: number, n: number, pad: number, headCount = 1, footCount = 1) {
  const rw = w / 2 + pad;
  const rh = h / 2 + pad;
  if (shape === "square" || shape === "rectangle") {
    return rectSeatOffset(rw, rh, i, n, headCount, footCount);
  }
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / (n || 1);
  return { dx: rw * Math.cos(angle), dy: rh * Math.sin(angle) };
}

// Smallest gap between any two seat centers around a table, used to decide whether
// horizontal name tags would overlap and should switch to a narrower vertical layout.
export function minSeatSpacing(shape: TableShape, w: number, h: number, n: number, pad: number, headCount = 1, footCount = 1): number {
  if (n <= 1) return Infinity;
  const points = Array.from({ length: n }, (_, i) => seatOffset(shape, w, h, i, n, pad, headCount, footCount));
  let min = Infinity;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const dx = points[a].dx - points[b].dx;
      const dy = points[a].dy - points[b].dy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < min) min = dist;
    }
  }
  return min;
}

// Name tags on the map are 68×30 room-px boxes centred on each seat. On a round
// or oval table with many seats, the seat ring is too tight for them to sit side
// by side, so they used to flip to tall upright tags that spilled into each other
// and into neighbouring tables. Instead, grow the table until every pair of
// horizontal tags clears (with a little margin), keeping names readable.
export const TAG_W = 68;
export const TAG_H = 30;
export function ringTagsFit(shape: TableShape, w: number, h: number, n: number) {
  const pts = Array.from({ length: n }, (_, i) => seatOffset(shape, w, h, i, n, 34));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (Math.abs(pts[a].dx - pts[b].dx) < TAG_W + 4 && Math.abs(pts[a].dy - pts[b].dy) < TAG_H + 4) return false;
    }
  }
  return true;
}

// ---- Rotation helpers ----
export const normDeg = (d: number) => ((Math.round(d) % 360) + 360) % 360;
// Rotate an offset (dx, dy) clockwise by `deg`.
export function rotateOffset(dx: number, dy: number, deg: number) {
  if (!deg) return { dx, dy };
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { dx: dx * c - dy * s, dy: dx * s + dy * c };
}
// Half-extents of the axis-aligned box around a w×h rectangle turned by `deg`.
export function rotatedHalfExtents(hw: number, hh: number, deg: number) {
  if (!deg) return { hw, hh };
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { hw: hw * c + hh * s, hh: hw * s + hh * c };
}
// Snap while turning: sticks to multiples of 45° when within 4°, else whole
// degrees; with Shift, 15° steps (as in PowerPoint).
export function snapDeg(d: number, fine15: boolean) {
  const n = ((d % 360) + 360) % 360;
  if (fine15) return normDeg(Math.round(n / 15) * 15);
  const near45 = Math.round(n / 45) * 45;
  return Math.abs(n - near45) <= 4 ? normDeg(near45) : normDeg(n);
}

// ---- Make-room-on-resize ----
// Footprint of something on the floor plan, as an axis-aligned box around its
// centre (half-width/half-height already include breathing room).
export interface FloorBox {
  id: string;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

// When the `anchors` (things that just got bigger) overlap their neighbours,
// nudge the neighbours apart: repeated passes push each overlapping pair apart
// along the shorter direction (anchors never move; two non-anchors split the
// push), and anything that gets pushed can push what it now touches, rippling
// outward. Things not involved stay put. If the result spills past the top or
// left edge, the whole plan is shifted right/down to keep it all on the canvas.
// Returns new centres for everything whose position changed, plus how many
// items were actually pushed (vs. just shifted along with the whole plan).
export function makeRoom(
  boxes: FloorBox[],
  anchors: Set<string>
): { positions: Record<string, { x: number; y: number }>; pushed: string[] } {
  const items = boxes.map((b) => ({ ...b }));
  const active = new Set(Array.from(anchors).filter((id) => items.some((b) => b.id === id)));
  const pushed = new Set<string>();
  for (let pass = 0; pass < 200; pass++) {
    let any = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (!active.has(a.id) && !active.has(b.id)) continue;
        const ox = a.hw + b.hw - Math.abs(a.cx - b.cx);
        const oy = a.hh + b.hh - Math.abs(a.cy - b.cy);
        if (ox <= 0.5 || oy <= 0.5) continue;
        const aFixed = anchors.has(a.id);
        const bFixed = anchors.has(b.id);
        if (aFixed && bFixed) continue; // two things the user resized — leave them be
        any = true;
        const shareA = aFixed ? 0 : bFixed ? 1 : 0.5;
        const shareB = 1 - shareA;
        if (ox <= oy) {
          const dir = Math.sign(b.cx - a.cx) || 1;
          a.cx -= dir * ox * shareA;
          b.cx += dir * ox * shareB;
        } else {
          const dir = Math.sign(b.cy - a.cy) || 1;
          a.cy -= dir * oy * shareA;
          b.cy += dir * oy * shareB;
        }
        [a, b].forEach((x) => {
          if (!anchors.has(x.id)) {
            pushed.add(x.id);
            active.add(x.id);
          }
        });
      }
    }
    if (!any) break;
  }
  const original = new Map(boxes.map((b) => [b.id, b]));
  const shiftX = Math.max(0, -Math.min(...items.map((b) => b.cx - b.hw)));
  const shiftY = Math.max(0, -Math.min(...items.map((b) => b.cy - b.hh)));
  const positions: Record<string, { x: number; y: number }> = {};
  items.forEach((b) => {
    const o = original.get(b.id)!;
    const x = Math.round(b.cx + shiftX);
    const y = Math.round(b.cy + shiftY);
    if (Math.abs(x - o.cx) > 0.5 || Math.abs(y - o.cy) > 0.5) positions[b.id] = { x, y };
  });
  return { positions, pushed: Array.from(pushed) };
}

export function computeLayout(
  tables: Table[],
  positionOverrides: Record<string, { x: number; y: number }> = {},
  fitBounds?: { width: number; height: number }
) {
  const autoTables = tables.filter((t) => !positionOverrides[t.id]);
  const tableCount = tables.length || 1;

  // Tables scale up when there are only a few of them, so a lone table (or a small
  // handful) actually fills the canvas instead of sitting small in the corner —
  // tapering back down to the normal baseline size by around 5-6 tables, where a
  // bigger size would just mean more scrolling instead of a better view. Capped at
  // 2.4x so a single table doesn't become absurd on its own — and further capped by
  // fitBounds (the actual visible space on screen) so growing a table never pushes
  // its own guests out of view, which is the whole point of making it bigger.
  const countScale = Math.max(1, Math.min(2.4, 2.4 / Math.sqrt(tableCount)));

  function build(scale: number) {
    // Precompute each table's footprint first (shape + capacity + how wide its name
    // needs it to be) so the auto-placement grid can be spaced to fit the biggest
    // one, rather than assuming every table is the same small size. Without this, a
    // table with a long custom name could end up wider than the fixed grid cell and
    // overlap its neighbor's name tag.
    const dims: Record<string, { r: number; w: number; h: number; seatR: number }> = {};
    let maxSeatR = 0;
    tables.forEach((t) => {
      let r = Math.min(58, 34 + t.capacity * 3.2) * scale * t.sizeScale;
      let { w, h } = shapeDims(t.shape, r, minTableTextWidth(t.label));
      if (t.shape === "round" || t.shape === "oval") {
        for (let guard = 0; guard < 60 && !ringTagsFit(t.shape, w, h, t.capacity); guard++) {
          r += 4;
          ({ w, h } = shapeDims(t.shape, r, minTableTextWidth(t.label)));
        }
      }
      const seatR = Math.max(w, h) / 2 + 34;
      dims[t.id] = { r, w, h, seatR };
      if (!positionOverrides[t.id]) maxSeatR = Math.max(maxSeatR, seatR);
    });

    const cols = Math.max(1, Math.ceil(Math.sqrt(autoTables.length || 1)));
    // seatR is the seat ring; name tags reach up to ~50px past it (upright tags on
    // crowded square/rectangle sides), so leave that much on each side plus a gap,
    // otherwise neighbouring tables' tags run into each other.
    const cell = Math.max(250, (maxSeatR + 52) * 2 + 24);
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
      // +88 (not +20) because a crowded table's rotated vertical name tag can
      // reach up to 50px beyond the seat center (see boxH in the seat-map
      // render below) — this keeps those tags from clipping against the
      // canvas edge on tables near the boundary.
      maxX = Math.max(maxX, cx + seatR + 88);
      maxY = Math.max(maxY, cy + seatR + 88);
    });
    const rows = Math.ceil(autoTables.length / cols);
    const gridHeight = Math.max(cell, rows * cell);
    return { positions, width: Math.max(cols * cell, maxX), height: Math.max(gridHeight, maxY), scale };
  }

  let scale = countScale;
  if (fitBounds && fitBounds.width > 0 && fitBounds.height > 0) {
    const atBaseline = build(1);
    // Only grow past the baseline size if there's actually room to — and never grow
    // past what fits. If even the baseline doesn't fit (a big plan with lots of
    // tables), leave it at baseline rather than shrinking further; that case is
    // expected to scroll, same as before.
    if (atBaseline.width <= fitBounds.width && atBaseline.height <= fitBounds.height) {
      const fitScale = Math.min(fitBounds.width / atBaseline.width, fitBounds.height / atBaseline.height);
      scale = Math.max(1, Math.min(countScale, fitScale));
    } else {
      scale = 1;
    }
  }

  return build(scale);
}
