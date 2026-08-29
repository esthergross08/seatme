"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = { muted: "#6B6580" };

export default function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      style={{
        fontSize: 13,
        color: C.muted,
        background: "none",
        border: "none",
        cursor: "pointer",
        textDecoration: "underline",
        padding: 0,
      }}
    >
      Sign out
    </button>
  );
}
