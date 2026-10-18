import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { getValidAccessToken, listBoardPins, downloadPinImages } from "@/lib/pinterest";

export const runtime = "nodejs";

// Turns the event's selected Pinterest board into Etsy search queries, so the
// "Etsy decor finds" links follow the board's actual colors and style instead
// of only the poster palette. The client caches the result per board + pin set
// and calls this again whenever the board (or its pins) change.

const SYSTEM_PROMPT = `You are a wedding and event decor shopper inside SeatMe, an event seating planner. You'll be shown images pinned to the user's own inspiration board. Study the colors, materials, textures, and overall style across the images, then write Etsy search queries that would find decor matching this board.

Return exactly 6 categories, one each for: table runners or linens, centerpieces, place cards, candles or lighting, guest book or signage, favors. For each, give a short label (1–3 words) and an Etsy search query of 3–6 words that names the specific colors and style you actually see (e.g. "dusty blue linen table runner", not "wedding table runner"). Don't use brand names. Then give one short sentence describing the board's look.

Call the etsy_finds tool with your answer.`;

const TOOL = {
  name: "etsy_finds",
  description: "Etsy search queries matched to the user's inspiration board.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One short sentence describing the board's colors and style." },
      categories: {
        type: "array",
        minItems: 4,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            query: { type: "string" },
          },
          required: ["label", "query"],
        },
      },
    },
    required: ["summary", "categories"],
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
  if (!role) return NextResponse.json({ error: "Not signed in or event not found." }, { status: 403 });

  let pins;
  let boardId: string;
  try {
    const auth = await getValidAccessToken(supabase, eventId);
    if (!auth) return NextResponse.json({ error: "Pinterest isn't connected for this event yet." }, { status: 404 });
    if (!auth.connection.board_id) return NextResponse.json({ error: "Pick a board first." }, { status: 400 });
    boardId = auth.connection.board_id;
    pins = await listBoardPins(auth.accessToken, boardId, 15);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load pins." }, { status: 502 });
  }

  const downloaded = await downloadPinImages(pins, 8);
  if (downloaded.length === 0) {
    return NextResponse.json({ error: "Couldn't download any of the pinned images. Try again in a moment." }, { status: 502 });
  }

  const content = [
    { type: "text" as const, text: "Here are pins from my event inspiration board. Find Etsy decor that matches:" },
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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "etsy_finds" },
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
  const raw: unknown = toolBlock?.input?.categories;
  const categories = Array.isArray(raw)
    ? raw
        .filter(
          (c): c is { label: string; query: string } =>
            !!c && typeof c.label === "string" && typeof c.query === "string" && c.label.trim() !== "" && c.query.trim() !== "",
        )
        .slice(0, 6)
        .map((c) => ({ label: c.label.trim().slice(0, 40), query: c.query.trim().slice(0, 100) }))
    : [];

  if (categories.length === 0) {
    return NextResponse.json({ error: "Couldn't match those pins to Etsy finds — try again." }, { status: 502 });
  }

  return NextResponse.json({
    boardId,
    summary: typeof toolBlock?.input?.summary === "string" ? toolBlock.input.summary : "",
    categories,
  });
}
