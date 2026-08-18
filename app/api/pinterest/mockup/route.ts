import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { getValidAccessToken, listBoardPins, downloadPinImages } from "@/lib/pinterest";
import { generateTableMockup } from "@/lib/openaiImage";

export const runtime = "nodejs";
// Image generation can take a while — give it more headroom than the default.
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { eventId } = body;
  if (!eventId) return NextResponse.json({ error: "Missing eventId." }, { status: 400 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Image generation isn't configured yet (missing OPENAI_API_KEY)." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "You don't have edit access to this event." }, { status: 403 });
  }

  let pins;
  try {
    const auth = await getValidAccessToken(supabase, eventId);
    if (!auth) return NextResponse.json({ error: "Pinterest isn't connected for this event yet." }, { status: 404 });
    if (!auth.connection.board_id) return NextResponse.json({ error: "Pick a board first." }, { status: 400 });
    pins = await listBoardPins(auth.accessToken, auth.connection.board_id, 15);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load pins." }, { status: 502 });
  }

  const downloaded = await downloadPinImages(pins, 6);
  if (downloaded.length === 0) {
    return NextResponse.json({ error: "Couldn't download any of the pinned images. Try again in a moment." }, { status: 502 });
  }

  try {
    const imageBase64 = await generateTableMockup(downloaded);
    return NextResponse.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't generate a mockup image." }, { status: 502 });
  }
}
