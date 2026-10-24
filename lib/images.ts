// SeatMe brand photography — the single place photo choices live.
//
// All photos are free to use under the Unsplash License (commercial use, no
// attribution required; https://unsplash.com/license) and are NOT Unsplash+
// images. Each was checked on its Unsplash page on 2026-10-24. Photographer
// credit is kept here anyway as good practice, and in case we add a credits
// line later.
//
// Photos are served through Next.js's image optimizer on SeatMe's own domain
// (/_next/image), which fetches them from Unsplash server-side, resizes and
// caches them. Visitors' browsers never contact Unsplash, so their IP
// addresses aren't shared with it. Unsplash is allowed as a source in
// next.config.ts (images.remotePatterns). To swap a photo, change it here only.

export interface BrandPhoto {
  /** Base CDN URL without size params. */
  src: string;
  alt: string;
  photographer: string;
  /** Unsplash photo page, for credit / license reference. */
  page: string;
}

export const PHOTOS = {
  /** Login / sign-up side panel. */
  tableCenterpiece: {
    src: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622",
    alt: "An elegant reception table set with a floral centerpiece",
    photographer: "CHUTTERSNAP",
    page: "https://unsplash.com/photos/aEnH4hJ_Mrs",
  },
  /** Events dashboard, first-time empty state. */
  longTable: {
    src: "https://images.unsplash.com/photo-1536392706976-e486e2ba97af",
    alt: "A long dining table set for a dinner party with flowers and candles",
    photographer: "M F",
    page: "https://unsplash.com/photos/fb0_wj2MZk4",
  },
  /** Guest-facing RSVP page header. */
  roseTable: {
    src: "https://images.unsplash.com/photo-1519225421980-715cb0215aed",
    alt: "A dinner table with wine glasses and pink roses",
    photographer: "Photos by Lanty",
    page: "https://unsplash.com/photos/O38Id_cyV4M",
  },
} satisfies Record<string, BrandPhoto>;

// Widths the optimizer accepts (Next.js defaults: deviceSizes + imageSizes).
const OPTIMIZER_WIDTHS = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/**
 * A remote image URL routed through SeatMe's own image optimizer, at the
 * smallest allowed width that covers `width`. Quality 75 is the only one
 * Next.js 16 allows by default.
 */
export function proxiedImageUrl(src: string, width: number): string {
  const w = OPTIMIZER_WIDTHS.find((x) => x >= width) ?? OPTIMIZER_WIDTHS[OPTIMIZER_WIDTHS.length - 1];
  const source = `${src}${src.includes("?") ? "&" : "?"}auto=format&fit=crop&w=${w}`;
  return `/_next/image?url=${encodeURIComponent(source)}&w=${w}&q=75`;
}

/** URL for a brand photo at a given display width. */
export function photoUrl(photo: BrandPhoto, width: number): string {
  return proxiedImageUrl(photo.src, width);
}

/** The homepage / welcome-page hero photo (predates lib/images.ts). */
export const HERO_PHOTO_SRC = "https://images.unsplash.com/photo-1758810743028-6b8e150ec98f";
