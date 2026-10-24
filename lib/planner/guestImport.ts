// Parsing guest lists imported from spreadsheets and wedding-website exports.
// Moved out of components/SeatingPlanner.tsx (2026-10-24); pure logic, no React.
import { RsvpStatus } from "./types";

// ---------- spreadsheet import parsing ----------
// Header synonyms are broad on purpose: Partiful, The Knot, Bliss & Bone, and
// plain spreadsheets all use slightly different column names for the same thing.
export const NAME_HEADERS = ["name", "guest", "guest name", "full name", "attendee", "attendee name", "guest full name"];
export const FIRST_NAME_HEADERS = ["first name", "first", "given name"];
export const LAST_NAME_HEADERS = ["last name", "last", "surname", "family name"];
export const GROUP_HEADERS = ["group", "groups", "table group", "party", "category", "tag", "tags", "side", "household"];
export const STATUS_HEADERS = ["rsvp", "rsvp status", "status", "response", "attending", "invite status"];
export const EMAIL_HEADERS = ["email", "email address", "e-mail", "e-mail address"];
export const MEAL_HEADERS = ["meal", "meal choice", "entree", "entree choice", "menu", "menu choice", "food choice", "meal selection"];
export const NOT_ATTENDING_VALUES = [
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
export const ATTENDING_VALUES = ["yes", "attending", "confirmed", "going", "accepted", "accept", "y"];

export function statusFromCell(cell: string): RsvpStatus | undefined {
  const v = cell.trim().toLowerCase();
  if (!v) return undefined;
  if (NOT_ATTENDING_VALUES.includes(v)) return "declined";
  if (ATTENDING_VALUES.includes(v)) return "attending";
  return "pending"; // recognized column, unrecognized value (e.g. "maybe", "tentative") — don't assume either way
}

export function parseGuestRows(raw: unknown[][]) {
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
