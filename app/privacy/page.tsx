import type { ReactNode } from "react";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#8A8272",
};

export const metadata = {
  title: "Privacy Policy — SeatMe",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-2" style={{ fontFamily: "Georgia, serif", color: C.ink }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed space-y-3" style={{ color: C.ink }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen w-full" style={{ backgroundColor: C.paper }}>
      <div className="max-w-2xl mx-auto px-6 py-16">
        <a href="/" className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ color: C.gold, textDecoration: "none" }}>
          ← SeatMe
        </a>
        <h1 className="text-3xl mt-3 mb-1" style={{ fontFamily: "Georgia, serif", color: C.ink }}>
          Privacy Policy
        </h1>
        <p className="text-xs mb-10" style={{ color: C.muted }}>
          Last updated August 17, 2026
        </p>

        <Section title="Overview">
          <p>
            SeatMe is a seating-planner tool for weddings and events, built and operated by Esther Gross. This policy
            explains what information SeatMe collects, why, and how it&apos;s used. SeatMe is a small, independently
            run tool — there are no advertisers, no data brokers, and nothing here is sold to anyone.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong>Account information.</strong> When you sign in, SeatMe uses Supabase Auth with email-based magic
            links, so we store your email address to identify your account.
          </p>
          <p>
            <strong>Event and guest information.</strong> Anything you enter into an event — the event name, guest
            names, group tags, table configuration, seating constraints, and seat assignments — is stored so the app
            can show it back to you and keep it in sync across sessions. If you invite collaborators to an event,
            their email address and role (owner, editor, or viewer) are stored as well.
          </p>
          <p>
            <strong>AI assistant.</strong> If you use SeatMe&apos;s conversational assistant or its decor-suggestion
            feature, the relevant event data (such as guest and table information, or images from a connected
            Pinterest board) is sent to Anthropic&apos;s Claude API to generate a response. This is only sent when
            you actively use those features.
          </p>
          <p>
            <strong>Pinterest (optional).</strong> If you choose to connect Pinterest to an event, SeatMe stores an
            access token for that connection and uses it to read the boards and pins on the Pinterest account you
            connected — only for the board you select, and only to generate decor suggestions. SeatMe never posts,
            edits, or deletes anything on your Pinterest account. You can disconnect Pinterest from an event at any
            time from within the app.
          </p>
          <p>
            <strong>Cookies.</strong> SeatMe uses cookies to keep you signed in (via Supabase) and a short-lived
            cookie during the Pinterest connection process to prevent cross-site request forgery. SeatMe does not
            use advertising or analytics cookies.
          </p>
        </Section>

        <Section title="How information is used">
          <p>
            Information is used to operate the app: to show you your events, keep your seating plan saved and synced,
            let you share an event with collaborators, and power the optional AI and Pinterest features described
            above. We don&apos;t use your data for advertising, and we don&apos;t sell or rent it to third parties.
          </p>
        </Section>

        <Section title="Who we share information with">
          <p>
            SeatMe relies on a small number of service providers to operate:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — hosts the database and handles authentication.</li>
            <li><strong>Vercel</strong> — hosts the application itself.</li>
            <li><strong>Anthropic</strong> — powers the optional AI chat and decor-suggestion features.</li>
            <li><strong>Pinterest</strong> — only if you choose to connect it, to read boards/pins you select.</li>
          </ul>
          <p>
            These providers process data on our behalf to run the service; they don&apos;t use it for their own
            purposes beyond that.
          </p>
        </Section>

        <Section title="A note about guest data">
          <p>
            SeatMe is used by event hosts to organize information about their guests. If you&apos;re a host, please
            only enter information about your guests that you have a reasonable basis to use for planning your
            event. If you&apos;re a guest and have questions about information a host has entered about you in
            SeatMe, please reach out to the host directly, or contact us using the details below.
          </p>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            Your event and account data is kept for as long as your account or event exists. You can delete guests,
            tables, or an entire event from within the app at any time. To request full account deletion, contact us
            using the email below.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>SeatMe is not directed at children, and we don&apos;t knowingly collect information from children.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes, we&apos;ll update the date at the top of this page. Continued use of SeatMe after
            a change means you accept the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Reach out at{" "}
            <a href="mailto:esther@gross.gg" style={{ color: C.gold }}>
              esther@gross.gg
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
