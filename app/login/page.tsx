"use client";

import { useState, type FormEvent, type CSSProperties, Suspense } from "react";
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.87 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type AuthMode = "signin" | "signup" | "magiclink";
type Status = "idle" | "sending" | "sent" | "error";

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/home` },
    });
    // On success the browser navigates away to Google, so this only runs on failure.
    if (error) {
      setGoogleLoading(false);
      setError(error.message);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
      });
      if (error) {
        setStatus("error");
        setError(error.message.includes("already registered") ? "That email already has an account — try signing in instead." : error.message);
        return;
      }
      if (data.session) {
        // Email confirmation is off for this project — account is active immediately.
        window.location.assign("/home");
        return;
      }
      setStatus("sent");
      return;
    }

    // signin
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("error");
      setError(
        error.message.toLowerCase().includes("invalid")
          ? "Incorrect email or password."
          : error.message
      );
      return;
    }
    if (data.session) {
      window.location.assign("/home");
    }
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above first, then click “Forgot password”.");
      return;
    }
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    marginBottom: 12,
    fontSize: 14,
    boxSizing: "border-box",
  };

  const primaryButtonStyle: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    backgroundColor: C.gold,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  };

  const showingConfirmation = status === "sent";

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
          {mode === "signup" ? "Create your account" : "Sign in"}
        </h1>

        {authError && !showingConfirmation && (
          <p style={{ color: C.wine, fontSize: 13, marginBottom: 16 }}>
            That sign-in link didn&apos;t work — it may have expired, already been used, or been
            opened in a different browser than the one you requested it from (this often happens
            with links opened inside an app like Instagram or Messenger). Try again below.
          </p>
        )}

        {showingConfirmation ? (
          <p style={{ fontSize: 14, color: C.sage }}>
            {mode === "magiclink"
              ? "Check your inbox for a sign-in link. You can close this tab."
              : mode === "signup"
              ? "Check your inbox for a confirmation link to finish creating your account."
              : "Check your inbox for a password reset link."}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                background: "#fff",
                color: C.ink,
                fontWeight: 600,
                fontSize: 14,
                cursor: googleLoading ? "default" : "pointer",
                opacity: googleLoading ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <GoogleIcon />
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontSize: 12, color: C.muted }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>

            {mode === "magiclink" ? (
              <form onSubmit={handleMagicLink}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
                <button type="submit" disabled={status === "sending"} style={{ ...primaryButtonStyle, opacity: status === "sending" ? 0.7 : 1 }}>
                  {status === "sending" ? "Sending…" : "Send magic link"}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Password"}
                  style={inputStyle}
                />
                <button type="submit" disabled={status === "sending"} style={{ ...primaryButtonStyle, opacity: status === "sending" ? 0.7 : 1 }}>
                  {status === "sending" ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>
            )}

            {error && <p style={{ color: C.wine, fontSize: 13, marginTop: 8 }}>{error}</p>}

            <div style={{ marginTop: 16, fontSize: 13, color: C.muted, display: "flex", flexDirection: "column", gap: 6 }}>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{ background: "none", border: "none", padding: 0, color: C.muted, textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                >
                  Forgot password?
                </button>
              )}
              {mode !== "magiclink" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                    setStatus("idle");
                  }}
                  style={{ background: "none", border: "none", padding: 0, color: C.muted, textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                >
                  {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "magiclink" ? "signin" : "magiclink");
                  setError(null);
                  setStatus("idle");
                }}
                style={{ background: "none", border: "none", padding: 0, color: C.muted, textDecoration: "underline", cursor: "pointer", fontSize: 13, textAlign: "left" }}
              >
                {mode === "magiclink" ? "Use a password instead" : "Email me a sign-in link instead"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
