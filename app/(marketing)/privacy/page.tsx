import type { ReactNode } from "react";
import { C, FONT } from "@/lib/theme";

// Keep this page in step with what the app actually does. Retention periods
// here are enforced by app/api/cron/retention/route.ts — change both together.

export const metadata = {
  title: "Privacy Policy — SeatMe",
};

const CONTACT_EMAIL = "esther@gross.gg";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-2" style={{ fontFamily: FONT.display, color: C.ink }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed space-y-3" style={{ color: C.ink }}>
        {children}
      </div>
    </section>
  );
}

function Email() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: C.gold }}>
      {CONTACT_EMAIL}
    </a>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="text-xs tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: C.gold }}>
        Legal
      </div>
      <h1 className="text-3xl mb-1" style={{ fontFamily: FONT.display, color: C.ink }}>
        Privacy Policy
      </h1>
      <p className="text-xs mb-10" style={{ color: C.muted }}>
        Last updated October 24, 2026
      </p>

      <Section title="Who we are">
        <p>
          SeatMe is a seating planner for events, built and run by Esther Gross, who is responsible for the
          personal data described here (the &quot;controller&quot; under the GDPR). You can reach us about anything
          in this policy at <Email />. SeatMe has no advertisers, doesn&apos;t sell data, and doesn&apos;t use it for
          advertising.
        </p>
      </Section>

      <Section title="If you're a guest">
        <p>
          Hosts use SeatMe to plan their events, so your name and details may be here because a host added them.
          The host decides what to record about their guests and is responsible for having a good reason to, and
          SeatMe stores it for them. If you RSVP through a SeatMe link, the RSVP page only checks your name against
          the guest list; it never shows you anything else the host has written about you.
        </p>
        <p>
          For questions about what a host has recorded about you, ask the host first. You can also contact us at{" "}
          <Email /> and we&apos;ll help.
        </p>
      </Section>

      <Section title="What we collect and why">
        <p>
          <strong>Your account.</strong> Your email address, and a password if you choose one (you can also sign in
          with an emailed link). Optionally your first and last name and a recovery phone number, if you add them.
          Used to run your account.
        </p>
        <p>
          <strong>Events and guests.</strong> Everything a host enters: the event&apos;s name, date and location,
          guest names, groups, emails, notes, tables, seating rules and seat assignments. Guest notes can include
          things like dietary needs or accessibility requirements; hosts should only record what&apos;s needed for
          the event. If you invite collaborators, we store their email address and role.
        </p>
        <p>
          <strong>RSVPs.</strong> When a guest RSVPs through a host&apos;s link, we store their answer, meal choices
          and, if the host turned comments on, their comment. To limit misuse, we count RSVP attempts per visitor
          using a one-way code made from their IP address, never the address itself, and delete those counts within
          2 days.
        </p>
        <p>
          <strong>Uploaded files.</strong> Venue floor plans and menus you upload. They&apos;re stored privately:
          only people with access to the event (or, for saved venues, you) can open them.
        </p>
        <p>
          <strong>Site visits.</strong> On our public pages we log the page, the referring site, any campaign tags in
          the link, and your browser type. To count distinct visitors we store a one-way code made from your IP
          address, browser and the date. It changes daily, so it can&apos;t follow you across days, and we never
          store your IP address. We also use Vercel Web Analytics, which counts page views without cookies.
        </p>
        <p>
          <strong>Usage records.</strong> Basic logs of when you sign in, import a guest list or use the assistant,
          and a daily count of AI requests per account so we can apply fair-use limits.
        </p>
        <p>
          <strong>Emails.</strong> If you sign up but don&apos;t get started, we may send one reminder with a sign-in
          link.
        </p>
        <p>
          <strong>Feedback.</strong> Anything you send through the feedback form.
        </p>
      </Section>

      <Section title="Our legal bases">
        <p>
          We process account, event, RSVP and file data to provide the service you or your host asked for (a
          contract, GDPR Art. 6(1)(b)). Site-visit statistics, usage limits, security logs and the reminder email
          rely on our legitimate interest in running, protecting and improving SeatMe (Art. 6(1)(f)); you can
          object to these at any time. Connecting Pinterest and using the AI features are your choice each time.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          When you use the assistant, ask SeatMe to read a floor plan or menu, or get decor suggestions, the relevant
          event data, file or Pinterest images are sent to Anthropic&apos;s Claude API to produce the answer. This
          only happens when you use those features. Anthropic processes this data on our behalf and doesn&apos;t use
          it to train its models.
        </p>
      </Section>

      <Section title="Pinterest (optional)">
        <p>
          If you connect Pinterest to an event, we store the access tokens for that connection on our servers. They
          are never sent to anyone&apos;s browser, and we use them only to read the board you select. SeatMe never
          posts, edits or deletes anything on Pinterest. You can disconnect at any time from the event.
        </p>
      </Section>

      <Section title="Who processes data for us">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Supabase</strong>: database, file storage and sign-in. Data is stored in the EU (Ireland).
          </li>
          <li>
            <strong>Vercel</strong>: hosts the app, serves our images and fonts, and provides cookie-free page
            analytics.
          </li>
          <li>
            <strong>Anthropic</strong>: the AI features described above.
          </li>
          <li>
            <strong>Pinterest</strong>: only if you connect it.
          </li>
        </ul>
        <p>
          Vercel and Anthropic are based in the United States, so some data is processed outside the EU. Those
          transfers rely on safeguards the GDPR recognizes, such as the European Commission&apos;s Standard
          Contractual Clauses or the EU-US Data Privacy Framework, as offered by each provider. Fonts and photos on
          SeatMe are served from our own domain, so your browser doesn&apos;t contact Google or Unsplash.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          SeatMe only uses cookies that are strictly necessary: one to keep you signed in, and a short-lived one that
          protects the Pinterest connection step. No advertising or tracking cookies, so there&apos;s no cookie banner.
        </p>
      </Section>

      <Section title="How long we keep data">
        <ul className="list-disc pl-5 space-y-1">
          <li>Accounts: until you ask us to delete yours.</li>
          <li>Accounts never confirmed by email: deleted after 30 days.</li>
          <li>Events, guests and RSVPs: until the event is deleted. Its uploaded files are removed within a few days.</li>
          <li>Site-visit logs: 12 months.</li>
          <li>AI and RSVP usage counts: 2 days.</li>
          <li>Pinterest tokens: until you disconnect Pinterest or delete the event.</li>
          <li>Feedback: as long as we need it to follow up.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask to access, correct, delete or export your personal data, to restrict how we use it, or object
          to processing based on our legitimate interests. Email <Email /> and we&apos;ll respond within one month.
          You can delete guests and whole events yourself at any time in the app.
        </p>
        <p>
          You also have the right to complain to a data protection authority. In France that&apos;s the CNIL
          (cnil.fr); elsewhere in the EU, your local authority.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Access to every event is checked on our servers and in the database itself, files are private, and
          connections are encrypted. If a breach ever affected your data, we&apos;d notify the authorities and,
          where required, you.
        </p>
      </Section>

      <Section title="Children">
        <p>
          SeatMe accounts are for adults. Hosts may list children as guests (for a family wedding, say); please
          record only what the event needs.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          When this policy changes, we&apos;ll update the date at the top of this page.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Email <Email />.
        </p>
      </Section>
    </div>
  );
}
