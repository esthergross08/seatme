"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LayoutGrid, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  ink: "#221F2B",
  card: "#FFFFFF",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#736D5F",
};

export default function AccountMenu({
  email,
  displayName,
}: {
  email: string;
  displayName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const label = displayName || email;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium"
        style={{
          background: "none",
          border: `1px solid ${C.line}`,
          borderRadius: 999,
          padding: "6px 12px",
          color: C.ink,
          cursor: "pointer",
        }}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
          style={{ backgroundColor: C.gold, color: "#fff" }}
        >
          {label.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={14} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 200,
            backgroundColor: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(34,31,43,0.12)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 text-sm"
            style={{ padding: "10px 14px", color: C.ink, textDecoration: "none" }}
          >
            <User size={15} style={{ color: C.gold }} />
            My info
          </Link>
          <Link
            href="/events"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 text-sm"
            style={{ padding: "10px 14px", color: C.ink, textDecoration: "none" }}
          >
            <LayoutGrid size={15} style={{ color: C.gold }} />
            My events
          </Link>
          <div style={{ borderTop: `1px solid ${C.line}` }} />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 text-sm w-full text-left"
            style={{
              padding: "10px 14px",
              color: C.muted,
              background: "none",
              border: "none",
              cursor: signingOut ? "default" : "pointer",
            }}
          >
            <LogOut size={15} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
