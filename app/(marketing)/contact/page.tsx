const C = {
  ink: "#221F2B",
  card: "#FFFFFF",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#736D5F",
};

export const metadata = {
  title: "Contact — SeatMe",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="text-xs tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: C.gold }}>
        Contact
      </div>
      <h1 className="text-3xl mb-4" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
        Get in touch
      </h1>
      <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
        Questions, feedback, or something not working the way you&apos;d expect? Email is the fastest way to reach us.
      </p>
      <a
        href="mailto:esther@gross.gg"
        className="inline-flex items-center text-sm font-semibold px-5 py-3 rounded-lg"
        style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
      >
        esther@gross.gg
      </a>
      <div className="mt-8 p-4 rounded-xl border text-xs leading-relaxed" style={{ borderColor: C.line, backgroundColor: C.card, color: C.muted }}>
        For requests about your personal data (access or deletion), see the <a href="/privacy" style={{ color: C.gold }}>Privacy Policy</a> — the same email above works for those too.
      </div>
    </div>
  );
}
