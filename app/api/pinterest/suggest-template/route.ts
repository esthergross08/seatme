import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { getValidAccessToken, listBoardPins, downloadPinImages } from "@/lib/pinterest";
import { POSTER_LAYOUTS, POSTER_PALETTES, POSTER_FONTS, POSTER_LAYOUT_IDS, POSTER_PALETTE_IDS, POSTER_FONT_IDS } from "@/lib/posterTemplates";

export const runtime = "nodejs";

const layoutList = POSTER_LAYOUTS.map((l) => `- "${l.id}" (${l.label}): ${l.description}`).join("\n");
const paletteList = POSTER_PALETTES.map((p) => `- "${p.id}" (${p.label}): ${p.description}`).join("\n");
const fontList = POSTER_FONTS.map((f) => `- "${f.id}" (${f.label}): ${f.description}`).join("\n");

const SYSTEM_PROMPT = `You are a wedding stationery consultant inside SeatMe, an event seating planner. You'll be shown images pinned to the user's own inspiration board. Study the colors, mood, and overall style across the images, then pick the closest-matching combination of layout, color palette, and typography from these fixed sets — you cannot invent new options, only choose among these:

Layout (structure and ornamentation — pick "flourish" for busy, maximalist, or ornate boards; "clean" for minimal or modern ones):
${layoutList}

Color palette (pick based on the dominant colors actually visible in the pins):
${paletteList}

Typography (pick based on overall mood — romantic, modern, classic):
${fontList}

Call the pick_style tool with your three choices and a one-sentence reason grounded in what you actually saw in the images (mention colors or style cues, not generic praise).`;

const TOOL = {
  name: "pick_style",
  description: "Pick the closest-matching layout, color palette, and typography for this board.",
  input_schema: {
    type: "object",
    properties: {
      layoutId: { type: "string", enum: POSTER_LAYOUT_IDS },
      paletteId: { type: "string", enum: POSTER_PALETTE_IDS },
      fontId: { type: "string", enum: POSTER_FONT_IDS },
      reason: { type: "string", description: "One short sentence explaining why this combination fits the board." },
    },
    required: ["layoutId", "paletteId", "fontId", "reason"],
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
        tool_choice: { type: "tool", name: "pick_style" },
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
  const layoutId = toolBlock?.input?.layoutId;
  const paletteId = toolBlock?.input?.paletteId;
  const fontId = toolBlock?.input?.fontId;
  const reason = toolBlock?.input?.reason;

  if (
    !layoutId ||
    !POSTER_LAYOUT_IDS.includes(layoutId) ||
    !paletteId ||
    !POSTER_PALETTE_IDS.includes(paletteId) ||
    !fontId ||
    !POSTER_FONT_IDS.includes(fontId)
  ) {
    return NextResponse.json({ error: "Couldn't match those pins to a style — try again." }, { status: 502 });
  }

  return NextResponse.json({ layoutId, paletteId, fontId, reason: reason || "" });
}
