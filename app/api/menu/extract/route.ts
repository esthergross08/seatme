import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a menu analyst inside SeatMe, an event seating planner. You'll be shown a caterer's menu document (a PDF, Word doc, or spreadsheet). Pull out the distinct dish/meal options guests would choose between when RSVPing — e.g. "Herb-Roasted Chicken", "Grilled Salmon", "Vegetarian Risotto", "Kids: Chicken Tenders". Use short, guest-facing names only (a few words each) — no prices, ingredient lists, descriptions, or section headers like "Entrees" or "Appetizers" on their own. Dedupe near-identical entries. Cap it at the most relevant 15 options.

Respond with ONLY strict JSON, no markdown code fences, no other text, in exactly this shape:
{"options":["Herb-Roasted Chicken","Grilled Salmon"],"note":"one short sentence about what you found or any uncertainty"}

If the document doesn't look like a menu at all, or you can't find distinct dish options, return {"options":[],"note":"a short honest sentence explaining why"}.`;

export async function POST(request: Request) {
  let body: { eventId?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { eventId, path } = body;
  if (!eventId || !path) return NextResponse.json({ error: "Missing eventId or path." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The AI assistant isn't configured yet (missing API key)." }, { status: 500 });
  }

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "You don't have edit access to this event." }, { status: 403 });
  }
  if (!path.startsWith(`events/${eventId}/`)) {
    return NextResponse.json({ error: "You don't have access to that file." }, { status: 403 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from("menus").download(path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "Couldn't load that menu file." }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = /\.pdf$/i.test(path);
  const isDocx = /\.docx$/i.test(path);
  const isSpreadsheet = /\.(xlsx|xls|csv)$/i.test(path);

  let content: Array<
    | { type: "text"; text: string }
    | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  >;

  if (isPdf) {
    content = [
      { type: "text", text: "Here's a caterer's menu document. Extract the guest-facing meal options from it:" },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    ];
  } else if (isDocx) {
    let text = "";
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch {
      return NextResponse.json({ error: "Couldn't read that Word document." }, { status: 422 });
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "That document appears to be empty." }, { status: 422 });
    }
    content = [
      {
        type: "text",
        text: `Here's the text of a caterer's menu document. Extract the guest-facing meal options from it:\n\n${text.slice(0, 12000)}`,
      },
    ];
  } else if (isSpreadsheet) {
    let text = "";
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      text = wb.SheetNames.map((sheetName) => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        return `Sheet: ${sheetName}\n${csv}`;
      }).join("\n\n");
    } catch {
      return NextResponse.json({ error: "Couldn't read that spreadsheet." }, { status: 422 });
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "That spreadsheet appears to be empty." }, { status: 422 });
    }
    content = [
      {
        type: "text",
        text: `Here's a caterer's menu spreadsheet, converted to CSV. Extract the guest-facing meal options from it:\n\n${text.slice(0, 12000)}`,
      },
    ];
  } else {
    return NextResponse.json({ error: "Unsupported file type. Upload a PDF, Word doc, or spreadsheet." }, { status: 400 });
  }

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

  let parsed: { options?: unknown[]; note?: string };
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Couldn't make sense of the AI's response. Try again." }, { status: 502 });
  }

  const seen = new Set<string>();
  const options = (Array.isArray(parsed.options) ? parsed.options : [])
    .map((o) => (typeof o === "string" ? o.trim().slice(0, 60) : ""))
    .filter((o) => {
      if (!o || seen.has(o.toLowerCase())) return false;
      seen.add(o.toLowerCase());
      return true;
    })
    .slice(0, 15);

  return NextResponse.json({
    options,
    note: typeof parsed.note === "string" ? parsed.note : null,
  });
}
