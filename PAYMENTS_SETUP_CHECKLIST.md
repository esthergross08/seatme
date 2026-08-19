# Payments Setup Checklist

Drafted 2026-08-19. Everything you need to get in place before SeatMe can charge for a paid tier — grouped in the order you'd actually tackle it. Nothing here has been built yet; this is prep for when the Design tier (or any paid feature) is ready to scope, per the open questions already in `ROADMAP.md`.

## 1. Decisions to make first (these shape everything else)

- **What's paid vs. free.** Current assumption in `ROADMAP.md`: seating planner + text decor suggestions stay free; mockup image generation + shop recommendations are the paid add-on. Confirm this before building anything.
- **Pricing model: one-time per-event, or recurring subscription.** Given most users plan a single event, a one-time per-event unlock probably fits better than a subscription — but this decision changes your data model (a `purchased` flag on an event vs. a subscription status on an account), so it needs to be settled before you touch the schema.
- **Price point.** Needs a number before checkout can be built. Doesn't need to be final/perfect — easy to adjust later — but Stripe needs at least a starting price.

## 2. Business & legal basics

- **Decide a business structure.** For a solo project, operating as a sole proprietor (using your own SSN) is the simplest starting point in the US — no state filing required. An LLC or getting an EIN adds a small amount of paperwork but keeps your SSN off of Stripe's records and looks more professional; not required to start, worth considering once revenue is real.
- **Open a dedicated bank account** (or at least know which account you'll link) — Stripe needs a bank account in the country the Stripe account is registered in to pay you out.
- **Have your ID ready.** Stripe's 2026 verification process is stricter than it used to been — expect to submit a government-issued ID and a selfie/facial verification as part of standard KYC (Know Your Customer) checks, not just fill out a form.

## 3. Choose and set up a payment processor

- **Stripe is the default recommendation** (already noted in `ROADMAP.md`) — it's the standard for solo/small SaaS, has first-class Next.js support, and its Checkout product handles PCI compliance, mobile responsiveness, and payment-method display for you.
- Alternative worth a quick look before committing: **merchant-of-record platforms** like Paddle or Lemon Squeezy. They charge a higher cut than Stripe (~5% vs. Stripe's ~2.9% + $0.30) but they act as the seller of record and handle all sales tax/VAT compliance globally themselves — meaningfully less admin for a solo founder than self-managing tax with Stripe. Worth weighing against Stripe Tax's limitations (below) before deciding.
- **If going with Stripe:** create the account and go through activation. You'll need: legal name, physical address, phone number, SSN or EIN, a live website URL (seatmeapp.com already qualifies), an accurate business/product description, and a bank account. Activation can take anywhere from minutes to a few days depending on how much manual review your application needs.

## 4. Tax compliance

- **Sales tax / VAT is your responsibility, not automatic.** If you use Stripe directly (not a merchant-of-record), enable **Stripe Tax** — it handles nexus monitoring, rate calculation, and collection in most jurisdictions (all US states, EU, UK, Australia, NZ, Canada, 100+ countries for VAT/GST), for a 0.5% per-transaction fee where you're registered to collect.
- **What Stripe Tax does *not* do for you:** registering you in new jurisdictions once you cross a sales threshold there, handling exemption certificates, or covering tax liability from before you turned it on. If you cross "nexus" in a state/country and don't register, you can owe back-taxes plus penalties — this is the main argument for a merchant-of-record instead, if you'd rather not track this yourself.
- Decide now whether you want to own this (Stripe + Stripe Tax) or offload it (Paddle/Lemon Squeezy) — this is much easier to decide before launch than to migrate later.

## 5. Product & data model changes

- Add a plan/tier field — either on the `events` table (if per-event purchase) or a new field tied to the user's account (if subscription). Needs an RLS-aware migration like the others in this project.
- Add gating logic in the app: check entitlement before showing/allowing the paid feature (mockup generation, shop recommendations).
- Decide what happens to previously-generated paid content if someone's access lapses (relevant only if you go subscription).

## 6. Stripe integration itself

- **Checkout Session endpoint** — a server route that creates a Stripe Checkout Session for the relevant event/user and redirects them to Stripe's hosted payment page (keeps you out of PCI scope almost entirely).
- **Webhook endpoint** — Stripe notifies your app asynchronously when a payment actually succeeds; this, not the redirect back to your site, should be the source of truth for unlocking the paid feature. Needs signature verification (`STRIPE_WEBHOOK_SECRET`) so random requests can't fake a "paid" event.
- **Customer Portal** (only if subscription model) — Stripe's hosted page for customers to manage/cancel their own subscription, so you don't have to build that UI yourself.
- **Environment variables** — `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` in both `.env.local` (test keys) and Vercel (test while building, then swap to live keys at launch). Same handling discipline as the Supabase service-role key — never expose the secret key client-side.

## 7. Legal pages (already flagged in the app itself)

- The current Terms of Service page literally says: *"before you're charged anything, and these terms will be updated to cover billing at that point."* That's your own reminder — update it before launch with: what's being sold, pricing, refund/cancellation policy, and how disputes are handled.
- Update the Privacy Policy to disclose Stripe (or your chosen processor) as a third party that processes payment data.
- Decide your refund policy now, not reactively after the first refund request — even a simple one or two sentences is enough.

## 8. Testing, before going live

- Build and test the whole flow in Stripe's **test mode** first, using Stripe's published test card numbers — don't test with a real card.
- Use the Stripe CLI to forward webhook events to your local dev server so you can test the webhook handler before deploying.
- Do a full dry run: test purchase → webhook fires → entitlement unlocks → feature actually becomes accessible → confirm it stays locked for a non-paying account.

## 9. Go-live

- Switch from test to live API keys in Vercel's production environment.
- Register the live webhook endpoint in the Stripe dashboard (test and live mode have separate webhook configs).
- Make one small real purchase yourself to confirm the whole path works end to end with real money before telling anyone it's live.
- Keep an eye on the Stripe dashboard for the first week or two — failed payments, disputes, and unexpected errors are much easier to catch early.

## Not covered here

This checklist is payments-specific. It doesn't include the still-open product questions from `ROADMAP.md` — the vendor-matching source for shop recommendations, and confirming what stays free vs. paid — both of which should be resolved before step 5 above, since they shape the data model.
