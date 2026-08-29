import FeedbackForm from "@/components/FeedbackForm";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  muted: "#736D5F",
};

export const metadata = {
  title: "About — SeatMe",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="text-xs tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: C.gold }}>
        About
      </div>
      <h1 className="text-3xl mb-6" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
        Why SeatMe exists
      </h1>
      <div className="text-sm leading-relaxed space-y-4" style={{ color: C.ink }}>
        <p>
          Seating charts have a way of turning into the most stressful part of planning an event — a tangle of
          spreadsheets, sticky notes, and &quot;wait, can these two actually sit together?&quot; texts at midnight.
          SeatMe started as a way to solve that directly: a place to lay out tables, list guests, set the rules
          that actually matter, and let the plan build itself.
        </p>
        <p>
          It&apos;s built for any event — weddings, dinners, galas, reunions — not just one kind of celebration.
          If you&apos;re the person other people hand their seating headache to, or a party organizer who hates
          the last minute stress, SeatMe is for you.
        </p>
        <p style={{ color: C.muted }}>
          Have a question or an idea for what SeatMe should do next?{" "}
          <a href="/contact" style={{ color: C.gold }}>Get in touch</a> or leave us a note below.
        </p>
      </div>
      <FeedbackForm />
    </div>
  );
}
