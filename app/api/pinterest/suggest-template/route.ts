import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { getValidAccessToken, listBoardPins, downloadPinImages } from "@/lib/pinterest";
import { POSTER_TEMPLATES, POSTER_TEMPLATE_IDS } from "@/lib/posterTemplates";

export const runtime = "nodejs";

const templateList = POSTER_TEMPLATES.map((t) => `- "${t.id}" (${t.label}): ${t.description}`).join("\n");

const SYSTEM_PROMPT = `You are a wedding stationery consultant inside SeatMe, an event seating planner. You'll be shown images pinned to the user's own inspiration board. Study the colors and overall style across the images, then pick whichever ONE of these fixed seating-chart poster styles is the closest match — you cannot invent a new style, only choose among these:

${templateList}

Call the pick_template tool with your choice and a one-sentence reason grounded in what you actually saw in the images (mention colors or style cues, not generic praise).`;

const TOOL = {
  name: "pick_template",
  description: "Pick the closest-matching poster template for this board.",
  input_schema: {
    type: "object",
    properties: {
      templateId: { type: "string", enum: POSTER_TEMPLATE_IDS },
      reason: { type: "string", description: "One short sentence explaining why this style fits the board." },
    },
    required: ["templateId", "reason"],
  },
};

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

  const downloaded = await downloadPinImages(pins, 8);
  if (downloaded.length === 0) {
    return NextResponse.json({ error: "Couldn't download any of the pinned images. Try again in a moment." }, { status: 502 });
  }

  const content = [
    { type: "text" as const, text: "Here are pins from my event inspiration board. Pick the poster style that fits best:" },
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
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "pick_template" },
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
  const toolBlock = (data.content || []).find((b: { type: string }) => b.type === "tool_use");
  const templateId = toolBlock?.input?.templateId;
  const reason = toolBlock?.input?.reason;

  if (!templateId || !POSTER_TEMPLATE_IDS.includes(templateId)) {
    return NextResponse.json({ error: "Couldn't match those pins to a style — try again." }, { status: 502 });
  }

  return NextResponse.json({ templateId, reason: reason || "" });
}
