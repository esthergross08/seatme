import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { getValidAccessToken, listBoardPins } from "@/lib/pinterest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Missing eventId." }, { status: 400 });

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role) return NextResponse.json({ error: "Not signed in or event not found." }, { status: 403 });

  try {
    const auth = await getValidAccessToken(supabase, eventId);
    if (!auth) return NextResponse.json({ error: "Pinterest isn't connected for this event yet." }, { status: 404 });
    if (!auth.connection.board_id) return NextResponse.json({ pins: [], boardSelected: false });
    const pins = await listBoardPins(auth.accessToken, auth.connection.board_id);
    return NextResponse.json({ pins, boardSelected: true, boardName: auth.connection.board_name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load pins." }, { status: 502 });
  }
}
