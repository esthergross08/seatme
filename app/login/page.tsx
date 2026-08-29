"use client";

import { useState, type FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
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
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 24,
            margin: "0 0 8px",
            color: C.ink,
          }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
          Enter your email and we&apos;ll send you a magic link — no password needed.
        </p>
        {authError && status !== "sent" && (
          <p style={{ color: C.wine, fontSize: 13, marginBottom: 16 }}>
            That sign-in link didn&apos;t work — it may have expired, already been used, or been
            opened in a different browser than the one you requested it from (this often happens
            with links opened inside an app like Instagram or Messenger). Request a new link below
            and open it in your regular browser.
          </p>
        )}
        {status === "sent" ? (
          <p style={{ fontSize: 14, color: C.sage }}>
            Check your inbox for a sign-in link. You can close this tab.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
              disabled={status === "sending"}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                backgroundColor: C.gold,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: status === "sending" ? "default" : "pointer",
                opacity: status === "sending" ? 0.7 : 1,
              }}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {error && (
              <p style={{ color: C.wine, fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
