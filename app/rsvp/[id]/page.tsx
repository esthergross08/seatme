import { createAdminClient } from "@/lib/supabase/admin";
import RsvpForm from "@/components/RsvpForm";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  line: "#E4DCC9",
  muted: "#736D5F",
};

function formatEventDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default async function RsvpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let event: {
    name: string | null;
    event_date: string | null;
    location: string | null;
    rsvp_enabled: boolean;
    data: {
      rsvpConfig?: {
        collectComments?: boolean;
        courses?: { id: string; name: string; options: string[] }[];
        mealOptions?: string[]; // legacy, pre-courses
      };
    } | null;
  } | null = null;
  let configError = false;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("events")
      .select("name, event_date, location, rsvp_enabled, data")
      .eq("id", id)
      .single();
    event = data;
  } catch {
    configError = true;
  }

  const rsvpConfig = event?.data?.rsvpConfig ?? {};
  const courses =
    rsvpConfig.courses ??
    (rsvpConfig.mealOptions?.length ? [{ id: "legacy-meal", name: "Meal", options: rsvpConfig.mealOptions }] : []);

  const notAvailable = configError || !event || !event.rsvp_enabled;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ backgroundColor: C.paper }}>
      <div className="w-full max-w-md">
        {notAvailable ? (
          <div className="rounded-2xl border p-8 text-center" style={{ borderColor: C.line, backgroundColor: C.card }}>
            <h1 className="text-xl mb-2" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
              RSVP not available
            </h1>
            <p className="text-sm" style={{ color: C.muted }}>
              {configError
                ? "Something's not set up right on our end — please reach out to the couple directly."
                : "This link isn't accepting RSVPs right now. If you think that's a mistake, reach out to the couple directly."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
            <div className="px-8 pt-8 pb-6 text-center border-b" style={{ borderColor: C.line }}>
              <div className="text-[11px] tracking-[0.2em] uppercase font-semibold mb-2" style={{ color: C.gold }}>
                You're invited
              </div>
              <h1 className="text-2xl mb-1" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
                {event!.name || "Our wedding"}
              </h1>
              {(event!.event_date || event!.location) && (
                <p className="text-sm" style={{ color: C.muted }}>
                  {[event!.event_date ? formatEventDate(event!.event_date) : null, event!.location || null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="px-8 py-6">
              <RsvpForm
                eventId={id}
                collectComments={rsvpConfig.collectComments ?? false}
                courses={courses}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
