"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = { gold: "#A8823C" };

export default function NewEventButton({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("events")
      .insert({ name: "New event", owner_id: ownerId, data: {} })
      .select()
      .single();
    setLoading(false);
    if (!error && data) {
      router.push(`/events/${data.id}`);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        border: "none",
        backgroundColor: C.gold,
        color: "#fff",
        fontWeight: 600,
        fontSize: 14,
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Creating…" : "+ New event"}
    </button>
  );
}
