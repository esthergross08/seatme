"use client";

import { useState, type FormEvent } from "react";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#736D5F",
};

export default function FeedbackForm() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send that. Try again.");
      setStatus("sent");
      setNote("");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (status === "sent") {
    return (
      <div
        className="mt-4 p-4 rounded-xl border text-sm"
        style={{ borderColor: C.line, backgroundColor: "#fff", color: C.sage }}
      >
        Thanks — got it!{" "}
        <button
          onClick={() => setStatus("idle")}
          style={{ color: C.gold, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13 }}
        >
          Leave another note
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ideas, bugs, requests — anything goes."
        rows={4}
        maxLength={2000}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${C.line}`,
          fontSize: 14,
          fontFamily: "Inter, sans-serif",
          color: C.ink,
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />
      <div className="flex items-center gap-3 mt-3">
        <button
          type="submit"
          disabled={status === "sending" || !note.trim()}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            backgroundColor: C.gold,
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: status === "sending" || !note.trim() ? "default" : "pointer",
            opacity: status === "sending" || !note.trim() ? 0.7 : 1,
          }}
        >
          {status === "sending" ? "Sending…" : "Send note"}
        </button>
        {status === "error" && (
          <span style={{ fontSize: 13, color: C.wine }}>{error}</span>
        )}
      </div>
    </form>
  );
}
