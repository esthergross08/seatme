import type { ReactNode } from "react";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  muted: "#736D5F",
};

export const metadata = {
  title: "Terms of Service — SeatMe",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-2" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed space-y-3" style={{ color: C.ink }}>
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="text-xs tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: C.gold }}>
        Legal
      </div>
      <h1 className="text-3xl mb-1" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
        Terms of Service
      </h1>
      <p className="text-xs mb-8" style={{ color: C.muted }}>
        Last updated August 18, 2026 — draft terms, not yet reviewed by a lawyer. Treat as a starting point.
      </p>

      <Section title="1. Agreement">
        <p>
          These terms govern your use of SeatMe, operated by Esther Gross. By creating an account or using SeatMe,
          you agree to them. If you don&apos;t agree, please don&apos;t use the service.
        </p>
      </Section>

      <Section title="2. What SeatMe is">
        <p>
          SeatMe is a seating-planner tool for events. Core planning features are free to use. Some features may
          require a paid plan in the future — if so, we&apos;ll be clear about what&apos;s free and what isn&apos;t
          before you&apos;re charged anything, and these terms will be updated to cover billing at that point.
        </p>
      </Section>

      <Section title="3. Accounts">
        <p>
          SeatMe uses email-based sign-in (a "magic link") rather than passwords. You&apos;re responsible for keeping
          access to the email address you sign in with, and for anything that happens under your account. Let us
          know right away if you think someone else has access to your account.
        </p>
      </Section>

      <Section title="4. Your content">
        <p>
          You own the event, guest, and seating data you put into SeatMe. We store and process it only to provide
          the service to you — to show it back to you, keep it synced, let you share an event with collaborators,
          and (only when you actively use those features) power the AI assistant and Pinterest-based decor
          suggestions. See the <a href="/privacy" style={{ color: C.gold }}>Privacy Policy</a> for the full detail on
          how your data is used and who it&apos;s shared with.
        </p>
        <p>
          If you invite collaborators to an event, you&apos;re responsible for making sure you have the right to
          share that event&apos;s guest information with them.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>
          Please don&apos;t use SeatMe to store or process information you don&apos;t have a legitimate basis to
          hold, to abuse or harass anyone, to attempt to break or overload the service, or for anything illegal. We
          can suspend or terminate accounts that violate this.
        </p>
      </Section>

      <Section title="6. Third-party services">
        <p>
          SeatMe relies on third-party providers to operate — including Supabase, Vercel, Anthropic, and, if you
          choose to connect it, Pinterest. Your use of those optional integrations (like connecting a Pinterest
          board) is also subject to that provider&apos;s own terms.
        </p>
      </Section>

      <Section title="7. Disclaimer & limitation of liability">
        <p>
          SeatMe is provided "as is," without warranties of any kind. We do our best to keep it reliable and your
          data safe, but we can&apos;t guarantee the service will be uninterrupted or error-free. To the extent
          permitted by law, SeatMe and its operator aren&apos;t liable for indirect, incidental, or consequential
          damages arising from your use of the service — including, for example, seating-plan errors, service
          downtime around your event date, or data loss.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          You can stop using SeatMe and delete your account at any time by contacting us. We may suspend or
          terminate access for violations of these terms or the Acceptable Use section above.
        </p>
      </Section>

      <Section title="9. Changes to these terms">
        <p>
          If these terms change, we&apos;ll update the date at the top of this page. Continued use of SeatMe after a
          change means you accept the updated terms.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          [Placeholder — governing jurisdiction to be specified once confirmed.]
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about these terms? Reach out at{" "}
          <a href="mailto:esther@gross.gg" style={{ color: C.gold }}>
            esther@gross.gg
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
