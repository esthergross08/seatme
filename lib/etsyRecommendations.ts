// Curated Etsy search recommendations, keyed to the same poster color palette a
// planner already picks for their seating chart (lib/posterTemplates.ts) — reusing
// that choice as the "design style" signal rather than asking for a second one.
// Links go to Etsy *search results*, not specific listings, since a specific
// listing can sell out or get delisted; a search stays useful indefinitely.
//
// Monetization: if NEXT_PUBLIC_ETSY_AWIN_MERCHANT_ID and
// NEXT_PUBLIC_ETSY_AWIN_AFFILIATE_ID are set (from Etsy's affiliate program,
// which runs through the Awin network), every link is wrapped with Awin's
// tracking redirect so a purchase earns commission. Until those are set, links
// just go straight to Etsy — the feature works either way, so it can ship
// before the affiliate account exists.

export interface EtsyCategory {
  label: string;
  query: string;
}

export interface EtsyRecommendationSet {
  paletteId: string;
  categories: EtsyCategory[];
}

const RECOMMENDATIONS: Record<string, EtsyCategory[]> = {
  gold: [
    { label: "Table runners", query: "gold wedding table runner" },
    { label: "Centerpieces", query: "gold cream wedding centerpiece" },
    { label: "Place cards", query: "gold wedding place cards" },
    { label: "Guest book", query: "gold wedding guest book" },
    { label: "Favors", query: "gold wedding favors" },
  ],
  mono: [
    { label: "Table runners", query: "black white modern table runner" },
    { label: "Centerpieces", query: "minimalist black white centerpiece" },
    { label: "Place cards", query: "modern minimalist place cards" },
    { label: "Guest book", query: "minimalist wedding guest book" },
    { label: "Favors", query: "modern minimalist wedding favors" },
  ],
  blush: [
    { label: "Table runners", query: "blush pink wedding table runner" },
    { label: "Centerpieces", query: "blush rose wedding centerpiece" },
    { label: "Place cards", query: "blush pink wedding place cards" },
    { label: "Guest book", query: "blush pink wedding guest book" },
    { label: "Favors", query: "blush pink wedding favors" },
  ],
  sage: [
    { label: "Table runners", query: "sage green wedding table runner" },
    { label: "Centerpieces", query: "sage green botanical wedding centerpiece" },
    { label: "Place cards", query: "sage green wedding place cards" },
    { label: "Guest book", query: "botanical wedding guest book" },
    { label: "Favors", query: "sage green wedding favors" },
  ],
  navy: [
    { label: "Table runners", query: "navy blue wedding table runner" },
    { label: "Centerpieces", query: "navy ivory wedding centerpiece" },
    { label: "Place cards", query: "navy wedding place cards" },
    { label: "Guest book", query: "navy wedding guest book" },
    { label: "Favors", query: "navy wedding favors" },
  ],
  terracotta: [
    { label: "Table runners", query: "terracotta wedding table runner" },
    { label: "Centerpieces", query: "terracotta boho wedding centerpiece" },
    { label: "Place cards", query: "terracotta wedding place cards" },
    { label: "Guest book", query: "boho wedding guest book" },
    { label: "Favors", query: "terracotta boho wedding favors" },
  ],
};

export function getEtsyRecommendations(paletteId: string | undefined | null): EtsyCategory[] {
  return RECOMMENDATIONS[paletteId || ""] || RECOMMENDATIONS.gold;
}

// Wraps a destination URL with Awin's tracking redirect when affiliate IDs are
// configured, otherwise returns the destination as-is. The `p=` deep-link
// format is Awin's standard, documented pattern — if Etsy's own Awin program
// page generates a differently-shaped template when you sign up, swap it in
// here (this is the only place it needs to change).
export function buildEtsyAffiliateUrl(destinationUrl: string): string {
  const merchantId = process.env.NEXT_PUBLIC_ETSY_AWIN_MERCHANT_ID;
  const affiliateId = process.env.NEXT_PUBLIC_ETSY_AWIN_AFFILIATE_ID;
  if (!merchantId || !affiliateId) return destinationUrl;
  const params = new URLSearchParams({
    awinmid: merchantId,
    awinaffid: affiliateId,
    clickref: "seatme-decor",
    p: destinationUrl,
  });
  return `https://www.awin1.com/cread.php?${params.toString()}`;
}

export function etsySearchUrl(query: string): string {
  return `https://www.etsy.com/search?q=${encodeURIComponent(query)}`;
}
