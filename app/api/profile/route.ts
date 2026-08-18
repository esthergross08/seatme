import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim().slice(0, 100) : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim().slice(0, 100) : "";
  const recoveryPhone = typeof body.recoveryPhone === "string" ? body.recoveryPhone.trim().slice(0, 40) : "";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      first_name: firstName || null,
      last_name: lastName || null,
      recovery_phone: recoveryPhone || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
