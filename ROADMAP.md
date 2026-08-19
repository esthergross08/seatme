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

Guest notes & group stats (2026-08-18): optional per-guest note (dietary needs, high chair, wheelchair access, etc.) editable in the Guests tab, shown as a tooltip and a small black dot indicator on that guest's seat in the floor-plan map (kept visually distinct from the separate group-color dot), plus a per-group seated/total breakdown chip row, a map legend, and a "Notes" toggle that highlights every noted seat and lists them for a final pre-print sweep. Raised after comparing SeatMe against iPlan.co.il (a much larger Israeli event-planning platform) — see the RSVP section below for the larger gap that comparison surfaced.

Internal usage dashboard (2026-08-18): `npm run admin:report` generates a local-only, gitignored HTML report (users, sign-up/confirmation status, events owned/shared, in-app activity) — never deployed, needs a Supabase service-role key in local `.env.local` only. Paired with an automatic activation-reminder system: an `access_log` table tracks real in-app usage (once/day/user), and a daily Vercel cron (`vercel.json` → `/api/cron/activation-reminders`) resends a sign-in link to anyone who signed up 24h+ ago and never confirmed, tracked in `activation_reminders` so nobody's reminded twice. `npm run send-activation-reminders` runs the same logic on demand for the current backlog.

Automatic group seating mode (2026-08-19): every group now has a seating mode — "together" (the new default) or "mixed" — that the solver applies automatically on every generate/regenerate, no manual constraints required. Previously, "keep this group together" only worked if you manually added a must-sit-with constraint for every pair of guests in the group (or the AI assistant tried to do that on your behalf, which is what prompted this — asking it to seat a group together made it struggle). Groups default to "together" since that's what tagging a group into existence usually means; click the link/shuffle icon next to a group's name (Guests tab) to flip it to "mixed" for cases like deliberately spreading a friend group across tables. Implemented as a soft cost-function preference in the solver (`buildAutoGroupPairs` in `SeatingPlanner.tsx`), weighted well below explicit user constraints so it never fights a real must/cannot rule and doesn't force an oversized group to impossibly cram onto one table — it just does its best. The AI assistant got a matching `set_group_seating_mode` operation so "seat the Ramirez family together" is now one call instead of N² pairwise constraints.

Conversational assistant caught up to recent features (2026-08-19): the chat assistant's tool schema predated guest notes, RSVP status, and meal choice, so it couldn't touch any of them even though the UI could. Added three operations — `set_guest_note`, `set_guest_rsvp_status`, `set_guest_meal_choice` — end to end (tool schema in `app/api/agent/route.ts`, apply logic in `SeatingPlanner.tsx`, shared types/labels in `lib/agentOperations.ts`), and the context sent to the model now includes each guest's current note/RSVP/meal so it can reference or reason about them. Marking a guest "declined" via chat frees their seat, same as doing it from the Guests tab. Worth a periodic check going forward: any new guest-level or event-level field added to the app should get a matching agent operation (or a deliberate decision to leave it UI-only), or the assistant quietly falls behind the product again.

Usage trend chart (2026-08-19): `npm run admin:report` now also writes `reports/admin-history.json`, appending one data point per day (total users, active users in the last 7 days, total events) each time you run it — re-running on the same day just updates today's entry instead of duplicating it. The report renders this as an inline SVG line chart (no external chart library, so it still works opened offline via file://) above the user table. Needs at least 2 days of runs before a trend line appears; until then it shows a note saying so. Easy to extend with more tracked metrics later — just add fields to `todayEntry` in `scripts/admin-report.mjs` and a matching series in `buildTrendChart`.

RSVP sync + meal choice import (2026-08-19): the guest import parser now recognizes email, RSVP status, and meal/entree columns (in addition to the existing name/group detection), tolerant of varying header wording. Three import modes: "Add to list" and "Replace list" as before, plus a new "Sync RSVPs" mode that matches an uploaded file's rows to existing guests by email (falling back to name), updates their RSVP status/meal choice/email and merges in any new group tags without touching seating or notes, creates a new guest record only for genuinely unmatched rows, and automatically frees the seat of anyone newly marked "declined." Guests declined via import — or manually, by clicking the new RSVP status badge in the Guests tab to cycle Pending → Attending → Declined — are excluded from seated/unseated counts and group stats, though they still show in the full guest list. Meal choice is a freeform text field per guest (no fixed dropdown, since exported menu-choice formats vary by wedding-website source) with a headcount breakdown by choice shown in the Seating tab. Every import is now logged to a new `import_log` table (guest count, mode, whether it carried RSVP/meal data) and surfaced in the internal usage dashboard (`npm run admin:report`) as aggregate stats plus a per-user "files imported / last import" column — answers "how many files people have uploaded."

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

Not started. Revisit this section when ready to scope the paid tier properly — it's a real new subsystem (billing + a new data source), not a small add-on. See `PAYMENTS_SETUP_CHECKLIST.md` (2026-08-19) for everything needed on the payments/billing side specifically — business setup, Stripe activation, tax compliance, data model, integration, legal pages, and go-live steps.

**Status**: Esther submitted a video demo to Pinterest requesting Standard access (2026-08-18), which would let any user connect their own board (Trial access currently only supports Esther's own account and shares one rate-limit bucket across the whole app). Awaiting Pinterest's review — no fixed SLA given.

### Idea: stylized, printable seating lists + table name designs

Raised 2026-08-18, alongside the Excel/PDF export work above. Instead of (or in addition to) the plain Excel/PDF exports, generate a *styled* seating list and table name cards/signage that visually match the couple's connected Pinterest board — and let the user iterate on the design (regenerate, pick a variant) rather than getting one fixed output. Natural extension of the Design tier: reuses the same board-derived style/palette work as the decor suggestion and mockup image, applied to printable documents instead of a product photo. Not scoped — fold into the Design tier planning above when that gets picked up, including deciding whether styled exports are part of the paid bundle or a lighter free upsell toward it.

## Planned: RSVP & guest communications

Raised 2026-08-18 after comparing SeatMe against iPlan.co.il, a much larger Israeli event-planning platform (venue/vendor marketplace + guest tools, 200,000+ events). Their single most-emphasized feature is closing the loop with actual guests — SMS/email RSVP links, live sync back to the seating chart, and bulk guest notifications (save-the-date, arrival instructions, thank-yous).

**Revised after research (2026-08-18):** building a competing guest-facing RSVP *collection* system is probably the wrong move — see `AUDIT_2026-08-18.md` for the full writeup. Zola, The Knot, and Joy all bundle genuinely free RSVP collection into their wedding websites, which most couples already have in place before they find SeatMe; asking guests to RSVP twice is a real adoption cost. What isn't free anywhere, though, is syncing an already-collected RSVP into a *good* seating chart — RSVPify paywalls that specifically ($24/mo+), and Kaiplan sells the combined product directly ($20/mo or ~$100 lifetime). That's the actual gap worth targeting.

Revised direction: an **RSVP sync, not an RSVP form** — let users import the RSVP export their existing wedding website already produces (extends the guest-import work that's already built, rather than standing up guest-facing pages, SMS/email delivery, and a new unauthenticated data model). If a direct-guest touchpoint still feels worth adding later, keep it narrow: a single close-to-the-event headcount confirmation for people who already RSVP'd yes, purely for catering accuracy — not a full RSVP replacement, and not something that competes with the wedding website itself.

**Shipped (2026-08-19):** the sync mechanism described above — see "RSVP sync + meal choice import" under Shipped. What's still open: a possible narrow close-to-the-event headcount confirmation touchpoint (not started, not scoped — revisit alongside the Design tier planning above), and watching real uploads to see whether meal-choice formats vary enough across wedding-website exports to need smarter detection than the current freeform text field.

## From the 2026-08-18 audit

A few smaller items surfaced during a full app review (bugs are tracked in `AUDIT_2026-08-18.md`, not repeated here). Feature candidates worth scoping when there's time:

- **Delete or archive an event** — no way to remove one today; events accumulate on the dashboard forever.
- **Duplicate/clone an event** — useful for recurring events (an annual gala) or planning multiple similar events at once.
- **A real invite-as-viewer flow** — the `role` concept (owner/editor/viewer) exists in the code but the invite form only ever creates editors; pair this with the RLS fix in `AUDIT_2026-08-18.md` so read-only is actually enforced, not just hidden in the UI.
- **Search/filter on the guest list and events dashboard** — not needed yet at current scale, but will be once users have 150+ guests or several events.
- **Event templates** — wedding / corporate / bar-mitzvah presets with sensible default table counts and capacities, to make the first five minutes faster.
- **Notify collaborators when invited** — invites currently grant access silently with no email to the invitee; worth reusing the activation-reminder email infrastructure for this.

## Longer-term vision

Esther's broader direction: grow SeatMe from a seating tool into a fuller event-planning tool over time, of which the decor/design tier is the first concrete step. No other concrete features scoped yet beyond decor/design.
