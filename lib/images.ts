// SeatMe brand photography — the single place photo choices live.
//
// All photos are free to use under the Unsplash License (commercial use, no
// attribution required; https://unsplash.com/license) and are NOT Unsplash+
// images. Each was checked on its Unsplash page on 2026-10-24. Photographer
// credit is kept here anyway as good practice, and in case we add a credits
// line later.
//
// Images are served straight from Unsplash's CDN (images.unsplash.com), which
// resizes on the fly via the w/q/fit params — the same approach the homepage
// hero already uses. To swap a photo, change it here only.

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

/** CDN URL for a photo at a given display width (served as WebP/AVIF where supported). */
export function photoUrl(photo: BrandPhoto, width: number): string {
  return `${photo.src}?w=${width}&q=80&auto=format&fit=crop`;
}
