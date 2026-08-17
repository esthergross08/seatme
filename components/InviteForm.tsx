"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#8A8272",
};

interface Member {
  email: string;
  role: string;
}

export default function InviteForm({
  eventId,
  initialMembers,
}: {
  eventId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("event_members")
      .upsert({ event_id: eventId, email: trimmed, role: "editor" });
    setStatus("idle");
    if (error) {
      setError(error.message);
      return;
    }
    setMembers((m) =>
      m.some((x) => x.email === trimmed) ? m : [...m, { email: trimmed, role: "editor" }]
    );
    setEmail("");
  }

  async function handleRemove(memberEmail: string) {
    const supabase = createClient();
    await supabase
      .from("event_members")
      .delete()
      .eq("event_id", eventId)
      .eq("email", memberEmail);
    setMembers((m) => m.filter((x) => x.email !== memberEmail));
  }

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 6 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Invite by email"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${C.line}`,
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "none",
            backgroundColor: C.gold,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Invite
        </button>
      </form>
      {error && <p style={{ color: C.wine, fontSize: 11, marginTop: 4 }}>{error}</p>}
      {members.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {members.map((m) => (
            <div
              key={m.email}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                color: C.ink,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.email}
              </span>
              <button
                onClick={() => handleRemove(m.email)}
                title="Remove access"
                style={{
                  background: "none",
                  border: "none",
                  color: C.muted,
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "0 0 0 6px",
                }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 10, color: C.sage, marginTop: 6 }}>
        Invited people get access next time they sign in with that email.
      </p>
    </div>
  );
}
