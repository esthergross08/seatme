// Small helpers: ids, HTML escaping, dates and initials.
// Moved out of components/SeatingPlanner.tsx (2026-10-24); pure logic, no React.
import { Guest } from "./types";

export const genId = () => Math.random().toString(36).slice(2, 9);

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Parse a plain "YYYY-MM-DD" as a local calendar date rather than via `new
// Date(dateStr)`, which treats it as UTC midnight and can print a day early
// depending on the viewer's timezone (same fix used on the events dashboard).
export function formatPosterDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Compact 1-2 char avatar initials for a guest name — "Jane Doe" -> "JD", "Cher" -> "C".
export function guestInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// One-line context summary for a guest row — mirrors the mockup's "no shellfish" /
// "plus one" / "arriving late" style subtitle. Picks the single most useful thing to
// surface: a note first (most specific), then meal choice, then a non-default RSVP status.
export function guestContextLine(g: Guest): string | null {
  if (g.note && g.note.trim()) return g.note.trim();
  if (g.mealChoice && g.mealChoice.trim()) return g.mealChoice.trim();
  if (g.rsvpStatus === "declined") return "Declined";
  if (g.rsvpStatus === "pending" || !g.rsvpStatus) return "RSVP pending";
  return null;
}

// Compact 1-3 char badge for an event name — "Ellis & Rowan" -> "E&R", "Company Offsite" -> "CO".
export function eventInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const ampMatch = trimmed.match(/^(.+?)\s*(?:&|\band\b)\s*(.+)$/i);
  if (ampMatch) {
    const a = ampMatch[1].trim()[0];
    const b = ampMatch[2].trim()[0];
    if (a && b) return `${a.toUpperCase()}&${b.toUpperCase()}`;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
