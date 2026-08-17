import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { buildAuthorizeUrl } from "@/lib/pinterest";

export const runtime = "nodejs";

// Kicks off the Pinterest OAuth flow for a given event: verifies the caller
// can edit the event, stashes a CSRF nonce in a short-lived cookie, then
// redirects the browser to Pinterest's authorize page.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "You don't have edit access to this event." }, { status: 403 });
  }

  if (!process.env.PINTEREST_CLIENT_ID || !process.env.PINTEREST_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Pinterest isn't configured yet — add PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const nonce = randomUUID();
  const redirectUri = `${url.origin}/api/pinterest/callback`;
  const authorizeUrl = buildAuthorizeUrl(redirectUri, `${eventId}:${nonce}`);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("pinterest_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
