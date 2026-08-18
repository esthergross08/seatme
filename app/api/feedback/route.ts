import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!note) {
    return NextResponse.json({ error: "Say a bit more before sending." }, { status: 400 });
  }
  if (note.length > 2000) {
    return NextResponse.json({ error: "That's a bit long — keep it under 2000 characters." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("feedback_notes").insert({
    note,
    user_id: user?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Couldn't send that. Try again in a bit." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
