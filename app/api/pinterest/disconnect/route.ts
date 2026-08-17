import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { eventId } = body;
  if (!eventId) return NextResponse.json({ error: "Missing eventId." }, { status: 400 });

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "You don't have edit access to this event." }, { status: 403 });
  }

  const { error } = await supabase.from("pinterest_connections").delete().eq("event_id", eventId);
  if (error) return NextResponse.json({ error: "Couldn't disconnect Pinterest." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
