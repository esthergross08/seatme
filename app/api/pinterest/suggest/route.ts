import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { getValidAccessToken, listBoardPins, downloadPinImages } from "@/lib/pinterest";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a table-decor consultant inside SeatMe, a wedding/event seating planner. You'll be shown images pinned to the couple's own inspiration board. Study the colors, materials, and style across the images, then suggest concrete table decor grounded in what they've actually pinned — don't suggest a generic style that ignores the images.

Cover, briefly: (1) the color palette and overall style you're seeing, (2) a centerpiece suggestion, (3) linens/tableware suggestion, (4) one more concrete detail (lighting, favors, signage, etc). Keep it to a short, warm, concrete paragraph or two — no headers, no bullet lists, plain conversational text.`;

export async function POST(request: Request) {
  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { eventId } = body;
  if (!eventId) return NextResponse.json({ error: "Missing eventId." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The AI assistant isn't configured yet (missing API key)." }, { status: 500 });
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

  // Anthropic's "fetch by URL" image source respects the target site's
  // robots.txt, and Pinterest's image CDN disallows that — so we download
  // each pin ourselves and send it as base64 instead.
  const downloaded = await downloadPinImages(pins, 8);
  if (downloaded.length === 0) {
    return NextResponse.json({ error: "Couldn't download any of the pinned images. Try again in a moment." }, { status: 502 });
  }

  const content = [
    { type: "text" as const, text: "Here are pins from our wedding inspiration board. Suggest table decor based on these:" },
    ...downloaded.map((img) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
    })),
  ];

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI service. Try again in a moment." }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    return NextResponse.json({ error: `AI service error (${anthropicRes.status}). ${errText.slice(0, 200)}` }, { status: 502 });
  }

  const data = await anthropicRes.json();
  const suggestion = (data.content || [])
    .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
    .map((b: { text?: string }) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({ suggestion: suggestion || "Couldn't come up with a suggestion from those pins — try a board with a few more images." });
}
