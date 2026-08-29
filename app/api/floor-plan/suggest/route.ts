import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";

export const runtime = "nodejs";

const SHAPES = new Set(["round", "oval", "square", "rectangle"]);

const SYSTEM_PROMPT = `You are a venue floor-plan analyst inside SeatMe, an event seating planner. You'll be shown a venue's seat/floor plan — a diagram, photo, or PDF showing where tables are laid out. Study it and estimate the tables shown: their shapes (round, oval, square, or rectangle), how many of each, and roughly how many seats each one fits based on its size relative to others in the plan.

Respond with ONLY strict JSON, no markdown code fences, no other text, in exactly this shape:
{"tables":[{"shape":"round","count":8,"capacity":10}],"note":"one short sentence about what you observed or any uncertainty"}

Group tables that share both a shape and a seat count into a single entry with a "count" — don't list each physical table separately. If you can't make out any distinct tables in the image (e.g. it's not actually a floor plan, or it's illegible), return {"tables":[],"note":"a short honest sentence explaining why"}. Never invent tables that aren't visibly there.`;

type SuggestBody =
  | { context: "event"; eventId: string; path: string }
  | { context: "location"; path: string };

export async function POST(request: Request) {
  let body: SuggestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.path) return NextResponse.json({ error: "Missing path." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The AI assistant isn't configured yet (missing API key)." }, { status: 500 });
  }

  const supabase = await createClient();

  if (body.context === "event") {
    const { role } = await getEventRole(supabase, body.eventId);
    if (!role || role === "viewer") {
      return NextResponse.json({ error: "You don't have edit access to this event." }, { status: 403 });
    }
  } else {
    // Locations have no collaborator concept — ownership is just "this file lives under
    // your own folder in storage," the same rule the upload's own RLS policy enforces.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !body.path.startsWith(`locations/${user.id}/`)) {
      return NextResponse.json({ error: "You don't have access to that file." }, { status: 403 });
    }
  }

  const { data: file, error: downloadError } = await supabase.storage.from("floor-plans").download(body.path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "Couldn't load that floor plan file." }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const isPdf = /\.pdf$/i.test(body.path);
  const mediaType = isPdf
    ? "application/pdf"
    : /\.png$/i.test(body.path)
    ? "image/png"
    : /\.webp$/i.test(body.path)
    ? "image/webp"
    : "image/jpeg";

  const fileBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: mediaType, data: base64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: base64 } };

  const content = [
    { type: "text" as const, text: "Here's a venue's floor plan. Estimate the table setup shown in it:" },
    fileBlock,
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
        max_tokens: 400,
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
  const raw = (data.content || [])
    .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
    .map((b: { text?: string }) => b.text)
    .join("\n")
    .trim();

  let parsed: { tables?: unknown[]; note?: string };
  try {
    // Strip an accidental ```json fence if the model added one despite instructions.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Couldn't make sense of the AI's response. Try again." }, { status: 502 });
  }

  const tables = (Array.isArray(parsed.tables) ? parsed.tables : [])
    .map((t) => {
      const row = t as { shape?: unknown; count?: unknown; capacity?: unknown };
      const shape = typeof row.shape === "string" && SHAPES.has(row.shape) ? row.shape : "round";
      const count = Math.max(1, Math.min(60, Math.round(Number(row.count) || 0)));
      const capacity = Math.max(1, Math.min(40, Math.round(Number(row.capacity) || 0)));
      return { shape, count, capacity };
    })
    .filter((t) => t.count > 0 && t.capacity > 0)
    .slice(0, 20);

  return NextResponse.json({
    tables,
    note: typeof parsed.note === "string" ? parsed.note : null,
  });
}
