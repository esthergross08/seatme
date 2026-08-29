"use client";

import { useState, type FormEvent, type CSSProperties } from "react";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#736D5F",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "Inter, sans-serif",
  color: C.ink,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: C.ink,
  marginBottom: 6,
};

export default function AccountForm({
  initialFirstName,
  initialLastName,
  initialRecoveryPhone,
}: {
  initialFirstName: string;
  initialLastName: string;
  initialRecoveryPhone: string;
}) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [recoveryPhone, setRecoveryPhone] = useState(initialRecoveryPhone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, recoveryPhone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't save your info. Try again.");
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 3000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={labelStyle}>First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Esther"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Gross"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Account recovery phone number</label>
        <input
          type="tel"
          value={recoveryPhone}
          onChange={(e) => setRecoveryPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
          Used only to help you recover access to your account — never shown to other users.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={status === "saving"}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            backgroundColor: C.gold,
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: status === "saving" ? "default" : "pointer",
            opacity: status === "saving" ? 0.7 : 1,
          }}
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" && (
          <span style={{ fontSize: 13, color: C.sage, fontWeight: 500 }}>Saved!</span>
        )}
        {status === "error" && (
          <span style={{ fontSize: 13, color: C.wine }}>{error}</span>
        )}
      </div>
    </form>
  );
}
