// SeatMe design tokens — the single source of truth for brand colors and type.
//
// Every page and component imports `C` (colors) and `FONT` (font stacks) from
// here instead of defining its own copy. The same values are mirrored as CSS
// variables in `app/globals.css` (`--color-ink`, `--font-display`, …) so
// Tailwind classes like `bg-paper` / `text-ink` / `font-display` work too —
// keep the two in sync when changing a value.
//
// Fonts are self-hosted with next/font in `app/layout.tsx` (downloaded at
// build time and served from SeatMe's own domain, so visitors' browsers never
// contact Google). next/font gives each family an internal name, exposed as
// the CSS variables below; FONT and the poster fonts refer to those
// variables, with the real family name as a fallback.

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
};

export const FONT = {
  /** Headings and display text. */
  display: "var(--font-fraunces), Fraunces, serif",
  /** Body copy and UI. */
  body: "var(--font-inter), Inter, sans-serif",
  /** Poster export's "Elegant Script" option. */
  script: "var(--font-playfair), 'Playfair Display', serif",
};
