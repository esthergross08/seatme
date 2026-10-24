// Event-type presets for the "New event" form: picking a type pre-fills a
// sensible table setup, sized from the guest count (the form's Max capacity
// field, or a typical size for that type when it's left empty).
//
// Every preset adds SPARE_SEAT_RATIO extra seats so there's room to move
// people around. The result is an ordinary table setup — everything stays
// editable in the Tables tab afterwards.

export type PresetShape = "round" | "oval" | "square" | "rectangle";

/** Same shape as the planner's TableGroup, as stored in events.data.tableGroups. */
export interface PresetTableGroup {
  id: string;
  label: string;
  count: number;
  capacity: number;
  shape: PresetShape;
}

export interface EventPreset {
  id: string;
  label: string;
  /** Guest count used when the form's capacity is empty. */
  typicalGuests: number;
  build: (guests: number) => PresetTableGroup[];
}

export const SPARE_SEAT_RATIO = 0.1;
/** Bar / Bat Mitzvah: share of guests seated at kids' tables. */
const KIDS_SHARE = 0.2;

const withSpare = (n: number) => Math.ceil(n * (1 + SPARE_SEAT_RATIO));
const tablesFor = (seats: number, perTable: number) => Math.max(1, Math.ceil(seats / perTable));
const shortId = () => Math.random().toString(36).slice(2, 9);

function group(label: string, count: number, capacity: number, shape: PresetShape): PresetTableGroup {
  return { id: shortId(), label, count, capacity, shape };
}

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: "wedding",
    label: "Wedding",
    typicalGuests: 100,
    build: (guests) => {
      const rest = Math.max(0, withSpare(guests) - 10);
      return [group("Head table", 1, 10, "rectangle"), ...(rest > 0 ? [group("Table", tablesFor(rest, 10), 10, "round")] : [])];
    },
  },
  {
    id: "mitzvah",
    label: "Bar / Bat Mitzvah",
    typicalGuests: 120,
    build: (guests) => {
      const kids = Math.round(guests * KIDS_SHARE);
      const adultSeats = Math.max(0, withSpare(guests - kids) - 10);
      return [
        group("Family table", 1, 10, "rectangle"),
        ...(adultSeats > 0 ? [group("Table", tablesFor(adultSeats, 10), 10, "round")] : []),
        ...(kids > 0 ? [group("Kids' table", tablesFor(withSpare(kids), 8), 8, "round")] : []),
      ];
    },
  },
  {
    id: "gala",
    label: "Gala / charity dinner",
    typicalGuests: 150,
    build: (guests) => {
      const total = tablesFor(withSpare(guests), 10);
      const vip = Math.min(2, total);
      return [group("VIP", vip, 10, "round"), ...(total > vip ? [group("Table", total - vip, 10, "round")] : [])];
    },
  },
  {
    id: "corporate",
    label: "Corporate dinner",
    typicalGuests: 80,
    build: (guests) => [group("Table", tablesFor(withSpare(guests), 8), 8, "round")],
  },
  {
    id: "dinner-party",
    label: "Birthday / dinner party",
    typicalGuests: 20,
    build: (guests) => {
      const seats = Math.max(4, withSpare(guests));
      const tables = tablesFor(seats, 14);
      // Spread evenly, rounded up to an even number so seats pair across the table.
      const perTable = Math.min(14, Math.ceil(seats / tables / 2) * 2);
      return [group("Long table", tables, perTable, "rectangle")];
    },
  },
  {
    id: "banquet",
    label: "Banquet / family-style",
    typicalGuests: 80,
    build: (guests) => [group("Long table", tablesFor(withSpare(guests), 20), 20, "rectangle")],
  },
];

export function getEventPreset(id: string | null | undefined): EventPreset | null {
  return EVENT_PRESETS.find((p) => p.id === id) ?? null;
}

/** One-line description of a setup, e.g. "Head table of 10 + 11 round tables of 10 · 120 seats". */
export function describeSetup(groups: PresetTableGroup[]): string {
  const parts = groups.map((g) => {
    if (g.count === 1) {
      const single = g.label === "Table" ? `1 ${g.shape} table` : g.label === "VIP" ? "1 VIP table" : g.label;
      return `${single} of ${g.capacity}`;
    }
    const plural = g.label === "Table" ? `${g.shape} tables` : g.label === "VIP" ? "VIP tables" : `${g.label.toLowerCase()}s`;
    return `${g.count} ${plural} of ${g.capacity}`;
  });
  const seats = groups.reduce((sum, g) => sum + g.count * g.capacity, 0);
  return `${parts.join(" + ")} · ${seats} seats`;
}
