# Business Entity Options for SeatMe

Researched 2026-08-29. Not legal or tax advice — I'm not a lawyer or accountant, and entity/residency questions are exactly the kind of thing that's cheap to get a real professional opinion on before committing (an hour with a cross-border accountant is worth it here). This is meant to give you the landscape so that conversation is efficient, not to replace it.

Relevant context: `PAYMENTS_SETUP_CHECKLIST.md` already assumes you'll need *some* legal entity before Stripe payments go live. This doc is the "which one" question that sits upstream of that checklist's step 2.

## The one fact that matters most: figure out tax residency first

Where you're a **tax resident** — not where you incorporate — is what determines most of your obligations. A UK company is UK tax resident if it's centrally managed and controlled from the UK; a French company the same for France. Incorporating somewhere doesn't let you opt out of where you actually live and work. If you split time between France and the UK, pin down which one (or both) you're currently tax resident in before picking a structure — that answer changes everything below.

## Option 1: Don't incorporate yet — sole trader / micro-entreprise

The simplest, cheapest starting point in either the UK or France, and worth defaulting to until SeatMe has real revenue:

- **UK sole trader**: no registration cost, register with HMRC once you're earning, pay income tax + National Insurance on profit via Self Assessment. Sole trader status suits most people earning below roughly £40k profit — a limited company only starts to make clear financial sense above that, and the gap is small until profits grow well past it.
- **France micro-entreprise**: zero cost to start, simplified tax (a fixed percentage of revenue, not actual expenses), capped at €77,700/year revenue for a services business like SaaS. Good for testing the product with no employees and modest revenue.

Downside of both: no liability shield (you personally are the business), and it looks less "official" to some payment processors or partners — though for a consumer SaaS product like SeatMe that's a minor concern at this stage.

## Option 2: UK limited company

Makes sense once profit is consistently well above ~£40-60k, or once liability protection / credibility with partners matters more than tax optimization. Note that a 2026 dividend tax rise narrowed the tax advantage limited companies used to have over sole trader status — the real case today is liability and credibility, not a guaranteed tax cut.

## Option 3: France SASU

The French equivalent — a single-shareholder simplified joint-stock company. Real accounting/formation cost (needs an accountant), but no revenue cap, full expense deductibility, and stronger asset protection than micro-entreprise. Roughly 65% of new French commercial-company registrations are now in the SAS/SASU family. Makes sense once you outgrow micro-entreprise's €77,700 cap or want the liability shield.

## Option 4: US LLC (Delaware or Wyoming) — the option to be most careful with

This is the one that gets recommended reflexively for "a SaaS business taking Stripe payments," and it's worth flagging why it's more complicated than it looks if you're UK or France tax resident:

- **The upside**: any non-US person can form and own 100% of a US LLC with no SSN or visit required. Wyoming is the usual pick for a bootstrapped, non-VC-backed business — around $60/year, minimal admin, no state income tax. It plugs cleanly into Stripe.
- **The catch**: the US treats a single-member LLC as "disregarded" (pass-through, no separate entity-level tax). The UK and France don't automatically see it that way — HMRC has historically treated US LLCs as opaque (i.e., a separate taxable entity), which means profits can get taxed once when earned inside the LLC and again when distributed to you personally, with limited relief. The UK government is mid-consultation on reforming this for individual members, but as of 2026 it isn't resolved, and France's equivalent risk isn't going away either. This "double-tax trap" is well-documented and specifically hits people in your situation (UK/France resident, US LLC) more than it hits actual US residents.
- **Bottom line**: a US LLC is the right tool if you're US tax resident, or if a cross-border accountant confirms your specific structure avoids the mismatch. It's the wrong default if you're simply "wherever's easiest to open a Stripe account" — Stripe itself works fine with a UK Ltd or French SASU too.

## The one thing true regardless of which you pick: VAT

Once SeatMe charges for anything, VAT/sales-tax obligations are based on **your customer's location**, not your entity's. Selling a digital subscription to an EU consumer means owing EU VAT from the first sale, UK consumers mean UK VAT (a separate system post-Brexit) — regardless of whether you're incorporated in Wyoming, London, or Paris. This doesn't change which entity to pick, but it means "avoid VAT by incorporating somewhere with no VAT" isn't actually on the table. `PAYMENTS_SETUP_CHECKLIST.md` already covers Stripe Tax / merchant-of-record as ways to handle this.

## Suggested next step

Given SeatMe has no revenue yet: stay unincorporated (sole trader / micro-entreprise, whichever matches wherever you're currently filing) until a paid tier is actually close to shipping. At that point, a short paid consult with an accountant who handles both UK and French cross-border cases (search for "UK France dual tax resident accountant") is the highest-leverage next step — it'll settle the residency question definitively and tell you which of options 2-4 actually avoids double taxation for your specific situation, which nothing above can do without knowing where you're actually filing today.

Sources consulted: [Sole Trader vs Limited Company UK 2026](https://assuredaccountingservices.co.uk/blog/sole-trader-vs-limited-company), [Micro-entreprise ou SASU 2026](https://www.keobiz.fr/le-mag/micro-entreprise-ou-sasu/), [SASU vs micro-entrepreneur 2026](https://larevuetech.fr/sasu-vs-micro-entrepreneur-in-france-how-solo-founders-are-weighing-taxes-benefits-and-liability-in-2026/), [Wyoming LLC for SaaS founders outside the US](https://wyomingllc.co/wyoming-llc-saas-founders-non-residents/), [US LLC tax implications for UK residents — Boodle Hatfield](https://www.boodlehatfield.com/articles/wait-and-llc-why-uk-residents-are-still-taxed-twice-on-us-income), [UK government consultation on reform of LLC member taxation](https://www.gov.uk/government/consultations/uk-residentindividualmembers-of-llcs-and-otherreversehybrids/consultation-on-reform-to-taxation-of-uk-resident-members-of-us-llcs), [EU VAT for SaaS 2026 — Dodo Payments](https://dodopayments.com/blogs/eu-vat-saas-guide-2026), [UK corporate tax residence — PwC](https://taxsummaries.pwc.com/united-kingdom/corporate/corporate-residence).
