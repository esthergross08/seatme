// Curated seating-chart poster styles for the "Seating chart poster" export.
// Deliberately a small fixed set (like Find Your Seat's own template picker)
// rather than fully freeform AI-generated colors/fonts — keeps quality and
// contrast predictable while still letting a couple's Pinterest board steer
// which one gets recommended (see /api/pinterest/suggest-template).
export interface PosterTemplate {
  id: string;
  label: string;
  description: string;
  background: string;
  card: string;
  ink: string;
  accent: string;
  line: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  headingStyle?: "normal" | "italic";
  headingWeight?: number;
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: "classic",
    label: "Classic Gold",
    description: "Warm cream and gold, serif headings — SeatMe's own default look.",
    background: "#F7F3EA",
    card: "#FFFFFF",
    ink: "#221F2B",
    accent: "#A8823C",
    line: "#E4DCC9",
    muted: "#736D5F",
    headingFont: "Fraunces, serif",
    bodyFont: "Inter, sans-serif",
    headingWeight: 600,
  },
  {
    id: "minimal",
    label: "Minimal Mono",
    description: "Black, white, and grey — one typeface, clean and modern.",
    background: "#FFFFFF",
    card: "#FFFFFF",
    ink: "#1A1A1A",
    accent: "#1A1A1A",
    line: "#E5E5E5",
    muted: "#8A8A8A",
    headingFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    headingWeight: 700,
  },
  {
    id: "romantic",
    label: "Romantic Script",
    description: "Blush and dusty rose, elegant editorial serif.",
    background: "#FBF3F0",
    card: "#FFFFFF",
    ink: "#3B2A2E",
    accent: "#B76E79",
    line: "#EFD9D3",
    muted: "#8C7377",
    headingFont: "'Playfair Display', serif",
    bodyFont: "Inter, sans-serif",
    headingStyle: "italic",
    headingWeight: 600,
  },
  {
    id: "botanical",
    label: "Botanical Sage",
    description: "Soft sage green, natural and organic.",
    background: "#F3F5EE",
    card: "#FFFFFF",
    ink: "#26301F",
    accent: "#54704F",
    line: "#DCE3D2",
    muted: "#71785F",
    headingFont: "Fraunces, serif",
    bodyFont: "Inter, sans-serif",
    headingWeight: 500,
  },
];

export const POSTER_TEMPLATE_IDS = POSTER_TEMPLATES.map((t) => t.id);

export function getPosterTemplate(id: string | undefined | null): PosterTemplate {
  return POSTER_TEMPLATES.find((t) => t.id === id) || POSTER_TEMPLATES[0];
}
