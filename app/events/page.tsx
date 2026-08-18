import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewEventButton from "./NewEventButton";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#8A8272",
};

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: C.paper,
        fontFamily: "Inter, sans-serif",
        padding: "40px 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: C.gold,
            }}
          >
            Seating Planner
          </div>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 28,
              color: C.ink,
              margin: "2px 0 0",
            }}
          >
            My events
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
            {user.email}
          </p>
        </div>

        <NewEventButton ownerId={user.id} />

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          {(events ?? []).length === 0 && (
            <p style={{ color: C.muted, fontSize: 14 }}>
              No events yet — create your first one above.
            </p>
          )}
          {(events ?? []).map((ev) => (
            <Link
              key={ev.id}
              href={`/events/${ev.id}`}
              style={{
                display: "block",
                padding: "14px 18px",
                background: "#fff",
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                textDecoration: "none",
                color: C.ink,
              }}
            >
              <div style={{ fontFamily: "Georgia, serif", fontSize: 16 }}>
                {ev.name || "Untitled event"}
                {ev.owner_id !== user.id && (
                  <span
                    style={{
                      fontSize: 11,
                      color: C.gold,
                      border: `1px solid ${C.gold}`,
                      borderRadius: 999,
                      padding: "1px 8px",
                      marginLeft: 8,
                      fontFamily: "Inter, sans-serif",
                      verticalAlign: "middle",
                    }}
                  >
                    shared with you
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Updated {new Date(ev.updated_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
