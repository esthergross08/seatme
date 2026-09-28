"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  gold: "#A8823C",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#736D5F",
};

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("done");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.paper,
        fontFamily: "Inter, sans-serif",
        padding: "24px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 32,
          background: "#fff",
          borderRadius: 16,
          border: `1px solid ${C.line}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 600,
            color: C.gold,
            marginBottom: 4,
          }}
        >
          Seating Planner
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, margin: "0 0 8px", color: C.ink }}>
          Set a new password
        </h1>

        {status === "done" ? (
          <>
            <p style={{ fontSize: 14, color: C.sage, marginBottom: 16 }}>
              Your password has been updated.
            </p>
            <a
              href="/home"
              style={{
                display: "inline-block",
                padding: "10px 12px",
                borderRadius: 8,
                backgroundColor: C.gold,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Continue
            </a>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (6+ characters)"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                marginBottom: 12,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={status === "saving"}
              style={{
                width: "100%",
                padding: "10px 12px",
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
              {status === "saving" ? "Saving…" : "Save password"}
            </button>
            {status === "error" && error && (
              <p style={{ color: C.wine, fontSize: 13, marginTop: 8 }}>
                {error} If this link expired, request a new one from the{" "}
                <a href="/login" style={{ color: C.wine }}>
                  sign-in page
                </a>
                .
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
