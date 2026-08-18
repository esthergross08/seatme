# SeatMe Roadmap

Working notes on what's shipped, what's built but gated, and what's planned. Not a commitment or timeline — just a place to come back to.

## Shipped

Core seating planner: table types with count/capacity, drag-and-drop guest seating, simulated-annealing auto-generate, seating constraints (must/cannot sit with), group tagging, spreadsheet import, magic-link auth, collaborator sharing (owner/editor/viewer), autosave, conversational AI assistant for making changes by chat.

Floor plan: per-table custom names, four table shapes (round/oval/square/rectangle), free drag-and-drop table repositioning, seated/unseated guest tracking, under-50%-filled table warnings with suggestions.

Guest import: format-tolerant CSV/Excel parsing (first/last name columns, broader header matching, auto-skip declined RSVPs), in-app explainer for exporting from Partiful/The Knot/Bliss & Bone (none of which have a public API, so CSV export is the only path).

Decor tab (free): connect a Pinterest board per event, view pins, get a text decor suggestion grounded in the board's actual images (Claude vision).

Privacy policy page at `/privacy`, required for the Pinterest app review.

## Built, not yet turned on

**AI table mockup image** — generates a photorealistic image of just the table (centerpiece, linens, place settings — no room, no people), grounded in the connected Pinterest board. Code is done (`/api/pinterest/mockup`, `lib/openaiImage.ts`), blocked on:
- OpenAI account/org verification (platform.openai.com → Settings → Organization)
- An `OPENAI_API_KEY` from Esther, wired into `.env.local` and Vercel

Real per-image cost (roughly a few cents to ~$0.20 depending on settings) and 10–30+ second generation time — something to factor into how it's paywalled/rate-limited.

## Planned: paid "Design tier"

Idea (raised 2026-08-18): bundle the mockup image generator with shop/vendor recommendations — pointing users to shops that sell items matching their pinned design — behind a paid tier, rather than shipping mockup generation for free.

Open questions to resolve before building:
- **Vendor matching source** — how do we find "shops with designs that look like this"? Options to evaluate: reverse image search against a shopping API (e.g. Google Shopping/Lens-style), Etsy's API (has a public API, good fit for wedding-decor-style goods), affiliate/retail APIs, or manually curated vendor links. Needs its own research pass before scoping.
- **Billing** — SeatMe has no payment infrastructure at all today. Needs a provider (Stripe is the default choice for a solo/small project), a plan/tier field on the account or event, and gating logic across the app.
- **Scope of "paid"** — per-event purchase (pay once per wedding) vs. per-account subscription. Given SeatMe's usage pattern (most users plan one event), a one-time per-event unlock may fit better than a recurring subscription — worth deciding before building billing, since it changes the data model.
- **What stays free** — current assumption: seating planner + text decor suggestions stay free; mockup image + shop recommendations are the paid add-on. Confirm before building.

Not started. Revisit this section when ready to scope the paid tier properly — it's a real new subsystem (billing + a new data source), not a small add-on.

## Longer-term vision

Esther's broader direction: grow SeatMe from a seating tool into a fuller event-planning tool over time, of which the decor/design tier is the first concrete step. No other concrete features scoped yet beyond decor/design.
