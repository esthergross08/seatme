// Seating-chart poster styling for the "Seating chart poster" export.
// Three independent choices — layout, color palette, typography — rather
// than one bundled "template", so a couple can mix a clean layout with a
// romantic palette, or a flourish layout with a modern sans, instead of
// picking the single closest-match bundle. Each dimension is still a small
// curated set (like Find Your Seat's own template picker) rather than fully
// freeform AI-generated design — keeps quality and contrast predictable
// while still letting a couple's Pinterest board steer the recommendation
// (see /api/pinterest/suggest-template).

export interface PosterLayout {
  id: string;
  label: string;
  description: string;
  flourish: boolean;
}

export const POSTER_LAYOUTS: PosterLayout[] = [
  {
    id: "clean",
    label: "Clean Lines",
    description: "Minimal rules and generous whitespace, no ornamentation.",
    flourish: false,
  },
  {
    id: "flourish",
    label: "Flourish",
    description: "A decorative frame, ornamental dividers, and swash accents.",
    flourish: true,
  },
];

export interface PosterPalette {
  id: string;
  label: string;
  description: string;
  background: string;
  card: string;
  ink: string;
  accent: string;
  line: string;
  muted: string;
}

export const POSTER_PALETTES: PosterPalette[] = [
  {
    id: "gold",
    label: "Classic Gold",
    description: "Warm cream and gold — SeatMe's own default look.",
    background: "#F7F3EA",
    card: "#FFFFFF",
    ink: "#221F2B",
    accent: "#A8823C",
    line: "#E4DCC9",
    muted: "#736D5F",
  },
  {
    id: "mono",
    label: "Minimal Mono",
    description: "Black, white, and grey.",
    background: "#FFFFFF",
    card: "#FFFFFF",
    ink: "#1A1A1A",
    accent: "#1A1A1A",
    line: "#E5E5E5",
    muted: "#8A8A8A",
  },
  {
    id: "blush",
    label: "Blush Rose",
    description: "Dusty rose and cream, soft and romantic.",
    background: "#FBF3F0",
    card: "#FFFFFF",
    ink: "#3B2A2E",
    accent: "#B76E79",
    line: "#EFD9D3",
    muted: "#8C7377",
  },
  {
    id: "sage",
    label: "Botanical Sage",
    description: "Soft sage green, natural and organic.",
    background: "#F3F5EE",
    card: "#FFFFFF",
    ink: "#26301F",
    accent: "#54704F",
    line: "#DCE3D2",
    muted: "#71785F",
  },
  {
    id: "navy",
    label: "Deep Navy",
    description: "Ink navy and warm ivory, formal and modern.",
    background: "#F5F4EF",
    card: "#FFFFFF",
    ink: "#1B2436",
    accent: "#2C3E60",
    line: "#DADCE2",
    muted: "#5B6472",
  },
  {
    id: "terracotta",
    label: "Terracotta",
    description: "Sun-baked clay and warm sand, earthy and celebratory.",
    background: "#FBF1E8",
    card: "#FFFFFF",
    ink: "#3A2318",
    accent: "#BC5B39",
    line: "#EDDAC7",
    muted: "#8A6E5E",
  },
];

export interface PosterFont {
  id: string;
  label: string;
  description: string;
  headingFont: string;
  bodyFont: string;
  headingStyle?: "normal" | "italic";
  headingWeight?: number;
}

export const POSTER_FONTS: PosterFont[] = [
  {
    id: "serif-classic",
    label: "Classic Serif",
    description: "Fraunces headings, understated and warm.",
    headingFont: "Fraunces, serif",
    bodyFont: "Inter, sans-serif",
    headingWeight: 600,
  },
  {
    id: "serif-italic",
    label: "Elegant Script",
    description: "Playfair Display italic — editorial and romantic.",
    headingFont: "'Playfair Display', serif",
    bodyFont: "Inter, sans-serif",
    headingStyle: "italic",
    headingWeight: 600,
  },
  {
    id: "sans-modern",
    label: "Modern Sans",
    description: "Inter throughout — clean and contemporary.",
    headingFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    headingWeight: 700,
  },
];

export const POSTER_LAYOUT_IDS = POSTER_LAYOUTS.map((l) => l.id);
export const POSTER_PALETTE_IDS = POSTER_PALETTES.map((p) => p.id);
export const POSTER_FONT_IDS = POSTER_FONTS.map((f) => f.id);

export function getPosterLayout(id: string | undefined | null): PosterLayout {
  return POSTER_LAYOUTS.find((l) => l.id === id) || POSTER_LAYOUTS[0];
}
export function getPosterPalette(id: string | undefined | null): PosterPalette {
  return POSTER_PALETTES.find((p) => p.id === id) || POSTER_PALETTES[0];
}
export function getPosterFont(id: string | undefined | null): PosterFont {
  return POSTER_FONTS.find((f) => f.id === id) || POSTER_FONTS[0];
}

export const DEFAULT_POSTER_LAYOUT = "clean";
export const DEFAULT_POSTER_PALETTE = "gold";
export const DEFAULT_POSTER_FONT = "serif-classic";

// Migration for events saved under the old single-`posterTemplate` model
// (classic / minimal / romantic / botanical) before layout/palette/font were
// split apart, so nobody's saved choice silently resets.
export function migrateLegacyPosterTemplate(id: string): { layout: string; palette: string; font: string } {
  switch (id) {
    case "minimal":
      return { layout: "clean", palette: "mono", font: "sans-modern" };
    case "romantic":
      return { layout: "flourish", palette: "blush", font: "serif-italic" };
    case "botanical":
      return { layout: "clean", palette: "sage", font: "serif-classic" };
    case "classic":
    default:
      return { layout: "clean", palette: "gold", font: "serif-classic" };
  }
}
