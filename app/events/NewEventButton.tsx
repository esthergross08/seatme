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
      className="text-sm font-semibold px-4 py-2.5 rounded-lg self-start sm:self-auto shrink-0"
      style={{
        border: "none",
        backgroundColor: C.gold,
        color: "#fff",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "Creating…" : "+ New event"}
    </button>
  );
}
