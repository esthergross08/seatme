import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { eventId?: string; boardId?: string; boardName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { eventId, boardId, boardName } = body;
  if (!eventId || !boardId) return NextResponse.json({ error: "Missing eventId or boardId." }, { status: 400 });

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "You don't have edit access to this event." }, { status: 403 });
  }

  const { error } = await supabase
    .from("pinterest_connections")
    .update({ board_id: boardId, board_name: boardName || null, updated_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) return NextResponse.json({ error: "Couldn't save the selected board." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
