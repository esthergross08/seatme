# SeatMe Site Map & Public-Website Gaps

Planning doc (2026-08-18). Not legal advice — the compliance section is a practical starting point, not a substitute for an actual lawyer once real money or EU scale is involved.

## Status (2026-08-18): built

Shared header/footer, homepage, About, Contact, Terms of Service (draft), robots.ts/sitemap.ts, a branded 404 page, and real page metadata are all built — see the routes below. Two old files need to be manually deleted before this will run (Claude's sandbox couldn't delete files this session): **`app/page.tsx`** and **`app/privacy/page.tsx`** — both are now superseded by their `app/(marketing)/...` versions and, left in place, will cause a duplicate-route build error. Pricing is intentionally not built yet — still waiting on the Design tier being scoped (see ROADMAP.md). About and Terms have placeholder content flagged inline for Esther to personalize/have reviewed.

## Current state (superseded by Status above — kept for history)

Today the site is really just the app shell: `/` (redirects to `/login` or `/events`), `/login`, `/events` (dashboard), `/events/[id]` (planner), `/privacy`. There's no marketing front door, no shared header/footer, no navigation between pages, and `app/layout.tsx` still has the default "Create Next App" title/description.

**The biggest structural gap isn't any one page — it's that there's no shared public header/footer.** Even once every page below exists, it won't feel like one website unless there's a consistent nav (logo, Home/About/Pricing, Login/Sign up) and footer (About, Privacy, Terms, Contact) wrapping the public pages. Worth building before or alongside the new pages, not after.

## Proposed site map

```
/                    → marketing homepage (currently just a redirect — needs real content)
/about               → About page
/pricing             → placeholder now, real once the Design tier is scoped (see ROADMAP.md)
/contact             → simple contact page or just a mailto link in the footer
/login                (exists)
/events                (exists — dashboard, requires auth)
/events/[id]            (exists — the planner itself, requires auth)
/privacy             → (exists)
/terms               → Terms of Service — missing, should exist before any paid tier launches
/cookies              → optional (see GDPR section — may not be needed yet)
```

Utility/SEO, not user-facing pages but expected of a real site: `robots.txt`, `sitemap.xml`, a custom 404 page, and proper page metadata/favicon/Open Graph tags (title currently just says "Create Next App").

## New pages, in rough priority order

1. **Shared header + footer** — foundational; everything else depends on this feeling cohesive.
2. **Terms of Service** (`/terms`) — pairs with the existing Privacy Policy. Standard practice to have both before charging money, and most infra providers' own ToS assume you have your own.
3. **Homepage** (`/`) — currently dead space for a signed-out visitor. Needs: what SeatMe is, who it's for (not just weddings — same wording fix as the Decor tab), a few screenshots, and a clear sign-up CTA.
4. **About** — who's behind it, why it exists. Can be short.
5. **Contact** — even just a monitored email in a simple page/footer link covers this.
6. **robots.txt / sitemap.xml / 404 page / metadata** — small, mechanical, good for SEO and polish.
7. **Pricing** — hold until the Design tier is actually scoped (see `ROADMAP.md`); a placeholder ("Free for now — paid features coming soon") is fine until then.

## GDPR: what's actually needed (informational, not legal advice)

GDPR applies based on whose data you process, not company size — since SeatMe is usable by anyone including EU-based couples/guests, it's worth taking seriously even as a small project. Breaking down what's real:

- **Cookie consent banner: probably not needed right now.** GDPR/ePrivacy only requires opt-in consent for *non-essential* cookies (analytics, ads, tracking). SeatMe currently only sets strictly-necessary cookies — the Supabase auth session and a short-lived Pinterest OAuth CSRF token — both exempt from consent requirements. **This changes the moment any analytics tool (Vercel Analytics, Google Analytics, etc.) gets added** — build the consent banner then, not preemptively.
- **Privacy policy accurately describing data use** — already done (`/privacy`), and it already covers the AI/Pinterest data flows.
- **A way to honor data subject requests** (access, deletion) within a reasonable time (commonly cited as 30 days) — currently handled as "email us" in the privacy policy, which is a legitimate manual process for a small app; doesn't need to be self-service/automated at this scale, just needs to actually be honored if someone asks.
- **Data processing agreements with subprocessors** — Supabase, Vercel, Anthropic, and (once turned on) OpenAI and Pinterest. These are typically standard click-through agreements available in each provider's trust/compliance portal, not custom legal negotiation — worth doing once, low effort.
- **Breach notification process** — a plan for what to do if something leaks (who to notify, within 72 hours), not a page. Worth having a short private note on this, not public-facing.

Net: the only genuinely missing piece right now is formalizing the DPAs with providers and having an actual (even informal) breach-response plan. No urgent page needed for GDPR specifically beyond keeping the privacy policy accurate — revisit the cookie banner question the moment analytics gets added.

Sources checked 2026-08-18: general GDPR/SaaS compliance guidance (see chat for links) — worth a real lawyer's sign-off before treating this as compliant, especially once the paid tier and real payment data are involved.
