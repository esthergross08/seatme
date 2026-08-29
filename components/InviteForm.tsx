"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  card: "#FFFFFF",
  gold: "#A8823C",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#736D5F",
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
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "sent") return;
    const t = setTimeout(() => setStatus("idle"), 4000);
    return () => clearTimeout(t);
  }, [status]);

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
    if (error) {
      setStatus("idle");
      setError(error.message);
      return;
    }
    setMembers((m) =>
      m.some((x) => x.email === trimmed) ? m : [...m, { email: trimmed, role: "editor" }]
    );
    setEmail("");
    // Actually let them know: trigger the same magic-link email used for sign-in, rather
    // than silently granting access and hoping they find the site on their own.
    try {
      await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/events` },
      });
    } catch {
      // best-effort — access was already granted even if the notification email fails
    }
    setStatus("sent");
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
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Invite by email"
          aria-label="Invite by email"
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md border text-xs outline-none"
          style={{ borderColor: C.line, color: C.ink, backgroundColor: C.card }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="px-2.5 py-1.5 rounded-md text-xs font-semibold shrink-0 disabled:opacity-60"
          style={{ backgroundColor: C.gold, color: "#fff" }}
        >
          {status === "sending" ? "Sending…" : "Invite"}
        </button>
      </form>
      {error && (
        <p className="text-[11px] mt-1" style={{ color: C.wine }}>
          {error}
        </p>
      )}
      {status === "sent" && (
        <p className="text-[11px] mt-1" style={{ color: C.sage }}>
          Invited — sent them a sign-in link by email.
        </p>
      )}
      {members.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {members.map((m) => (
            <div key={m.email} className="flex items-center justify-between gap-1 text-xs" style={{ color: C.ink }}>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{m.email}</span>
              <button
                onClick={() => handleRemove(m.email)}
                title="Remove access"
                aria-label={`Remove access for ${m.email}`}
                className="p-0.5 rounded shrink-0 hover:bg-black/5"
                style={{ color: C.muted }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] mt-1.5" style={{ color: C.muted }}>
        Invited people get an email with a sign-in link, and access as soon as they use it.
      </p>
    </div>
  );
}
