// SeatMe design tokens — the single source of truth for brand colors and type.
//
// Every page and component imports `C` (colors) and `FONT` (font stacks) from
// here instead of defining its own copy. The same values are mirrored as CSS
// variables in `app/globals.css` (`--color-ink`, `--font-display`, …) so
// Tailwind classes like `bg-paper` / `text-ink` / `font-display` work too —
// keep the two in sync when changing a value.
//
// Fonts are loaded once, by family name, in `app/layout.tsx`. They're loaded by
// name (not via next/font) on purpose: the poster export in
// `lib/posterTemplates.ts` renders through html2canvas and refers to fonts by
// their real family names, which next/font would rename.

export const C = {
  /** Primary text, dark buttons. */
  ink: "#221F2B",
  /** Page background (warm off-white). */
  paper: "#F7F3EA",
  /** Raised surfaces: cards, panels, inputs. */
  card: "#FFFFFF",
  /** Brand accent: eyebrows, highlights, primary accents. */
  gold: "#A8823C",
  /** Soft gold fill: selected states, badges. */
  goldSoft: "#E7D9B8",
  /** Danger / conflicts / destructive actions. */
  wine: "#8C3B3B",
  /** Success / confirmed / satisfied rules. */
  sage: "#54704F",
  /** Hairline borders and dividers. */
  line: "#E4DCC9",
  /** Secondary text. */
  muted: "#736D5F",
} as const;

export const FONT = {
  /** Headings and display text. */
  display: "Fraunces, serif",
  /** Body copy and UI. */
  body: "Inter, sans-serif",
} as const;

/** Google Fonts stylesheet for every family the app (and poster export) uses. */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,400;1,600&display=swap";
