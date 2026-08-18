# SeatMe Roadmap

Working notes on what's shipped, what's built but gated, and what's planned. Not a commitment or timeline — just a place to come back to.

## Shipped

Core seating planner: table types with count/capacity, drag-and-drop guest seating, simulated-annealing auto-generate, seating constraints (must/cannot sit with), group tagging, spreadsheet import, magic-link auth, collaborator sharing (owner/editor/viewer), autosave, conversational AI assistant for making changes by chat.

Floor plan: per-table custom names, four table shapes (round/oval/square/rectangle), free drag-and-drop table repositioning, seated/unseated guest tracking, under-50%-filled table warnings with suggestions.

Guest import: format-tolerant CSV/Excel parsing (first/last name columns, broader header matching, auto-skip declined RSVPs), in-app explainer for exporting from Partiful/The Knot/Bliss & Bone (none of which have a public API, so CSV export is the only path).

Decor tab (free): connect a Pinterest board per event, view first 3 pins with an option to expand to the full board, get a short text decor suggestion (one style recap sentence + 3-5 bullet recommendations) grounded in the board's actual images (Claude vision).

Privacy policy page at `/privacy`, required for the Pinterest app review.

Exports (2026-08-18): "Excel" button on the seating tab downloads a Table/Seat/Guest list in seat order (so seatmates land on consecutive rows) via the existing SheetJS (`xlsx`) dependency. "PDF" button (Map view only) rasterizes the on-screen floor plan via `html2canvas-pro` and assembles it into a PDF sized to fit via `jspdf` — both are new dependencies added to `package.json`, run `npm install` to pick them up. Used `html2canvas-pro` rather than the original `html2canvas` because Tailwind v4's default oklch-based color output breaks the unmaintained original.

Public site (2026-08-18): shared header/footer with an account dropdown (My info / My events / Sign out) present on every page, real homepage with a hero photo, About/Contact/Terms/Privacy pages, `/home` as the signed-in landing page, `/account` for editing first/last name and a recovery phone number (new `profiles` table), and an open feedback box on the About page (`feedback_notes` table, anonymous submissions allowed).

Guest notes & group stats (2026-08-18): optional per-guest note (dietary needs, high chair, wheelchair access, etc.) editable in the Guests tab, shown as a tooltip and a small gold dot indicator on that guest's seat in the floor-plan map, plus a per-group seated/total breakdown chip row next to the seated-count summary in the Seating tab. Raised after comparing SeatMe against iPlan.co.il (a much larger Israeli event-planning platform) — see the RSVP section below for the larger gap that comparison surfaced.

## Built, not yet turned on

**AI table mockup image** — generates a photorealistic image of just the table (centerpiece, linens, place settings — no room, no people), grounded in the connected Pinterest board. Backend code is done (`/api/pinterest/mockup`, `lib/openaiImage.ts`) and left in place but dormant; the UI trigger button was intentionally removed from `DecorPanel.tsx` (2026-08-18) since it wasn't leading anywhere yet. Blocked on:
- OpenAI account/org verification (platform.openai.com → Settings → Organization)
- An `OPENAI_API_KEY` from Esther, wired into `.env.local` and Vercel
- A decision to bundle it into the paid Design tier (see below) rather than ship it free

Real per-image cost (roughly a few cents to ~$0.20 depending on settings) and 10–30+ second generation time — something to factor into how it's paywalled/rate-limited. When picking this back up, re-add a button in `DecorPanel.tsx` calling `POST /api/pinterest/mockup`.

## Planned: paid "Design tier"

Idea (raised 2026-08-18): bundle the mockup image generator with shop/vendor recommendations — pointing users to shops that sell items matching their pinned design — behind a paid tier, rather than shipping mockup generation for free.

Open questions to resolve before building:
- **Vendor matching source** — how do we find "shops with designs that look like this"? Options to evaluate: reverse image search against a shopping API (e.g. Google Shopping/Lens-style), Etsy's API (has a public API, good fit for wedding-decor-style goods), affiliate/retail APIs, or manually curated vendor links. Needs its own research pass before scoping.
- **Billing** — SeatMe has no payment infrastructure at all today. Needs a provider (Stripe is the default choice for a solo/small project), a plan/tier field on the account or event, and gating logic across the app.
- **Scope of "paid"** — per-event purchase (pay once per wedding) vs. per-account subscription. Given SeatMe's usage pattern (most users plan one event), a one-time per-event unlock may fit better than a recurring subscription — worth deciding before building billing, since it changes the data model.
- **What stays free** — current assumption: seating planner + text decor suggestions stay free; mockup image + shop recommendations are the paid add-on. Confirm before building.

Not started. Revisit this section when ready to scope the paid tier properly — it's a real new subsystem (billing + a new data source), not a small add-on.

**Status**: Esther submitted a video demo to Pinterest requesting Standard access (2026-08-18), which would let any user connect their own board (Trial access currently only supports Esther's own account and shares one rate-limit bucket across the whole app). Awaiting Pinterest's review — no fixed SLA given.

### Idea: stylized, printable seating lists + table name designs

Raised 2026-08-18, alongside the Excel/PDF export work above. Instead of (or in addition to) the plain Excel/PDF exports, generate a *styled* seating list and table name cards/signage that visually match the couple's connected Pinterest board — and let the user iterate on the design (regenerate, pick a variant) rather than getting one fixed output. Natural extension of the Design tier: reuses the same board-derived style/palette work as the decor suggestion and mockup image, applied to printable documents instead of a product photo. Not scoped — fold into the Design tier planning above when that gets picked up, including deciding whether styled exports are part of the paid bundle or a lighter free upsell toward it.

## Planned: RSVP & guest communications

Raised 2026-08-18 after comparing SeatMe against iPlan.co.il, a much larger Israeli event-planning platform (venue/vendor marketplace + guest tools, 200,000+ events). Their single most-emphasized feature — and the biggest functional gap for SeatMe — is closing the loop with actual guests, not just the person building the plan:

- **Guest-facing RSVP links** — an SMS or emailed link each guest can tap to confirm attendance and headcount themselves, no login required.
- **Live sync back to the seating chart** — when a guest updates their RSVP, the seated/unseated counts and table headcounts update automatically instead of the organizer re-entering it by hand.
- **Bulk guest notifications** — save-the-date pings, arrival/parking instructions, thank-you messages, sent to some or all of the guest list at once.
- iPlan also sells a paid human call-center follow-up service for non-responders — worth noting as a differentiator but not something to build; a good async reminder flow (auto-resend the RSVP link after N days of silence) covers most of the same need without the staffing cost.

Not started, not scoped. This is a real new subsystem, not a small add-on — it needs guest-facing pages that don't require an account, an SMS or email provider (e.g. Twilio, Resend/Postmark), and a data model that distinguishes "guest imported from a list" from "guest who has confirmed." Worth scoping properly (including whether it's free or part of a paid tier) before starting, similar to how the Design tier is being handled below.

## Longer-term vision

Esther's broader direction: grow SeatMe from a seating tool into a fuller event-planning tool over time, of which the decor/design tier is the first concrete step. No other concrete features scoped yet beyond decor/design.
