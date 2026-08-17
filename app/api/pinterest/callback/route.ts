import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getEventRole } from "@/lib/eventAccess";
import { exchangeCodeForToken } from "@/lib/pinterest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error");

  const [eventId, stateNonce] = state.split(":");

  const redirectToEvent = (query: string) =>
    NextResponse.redirect(`${url.origin}/events/${eventId || ""}?${query}`);

  if (oauthError) {
    return redirectToEvent(`pinterest=error&reason=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !eventId || !stateNonce) {
    return redirectToEvent("pinterest=error&reason=invalid_response");
  }

  const cookieStore = await cookies();
  const savedNonce = cookieStore.get("pinterest_oauth_nonce")?.value;
  if (!savedNonce || savedNonce !== stateNonce) {
    return redirectToEvent("pinterest=error&reason=state_mismatch");
  }

  const supabase = await createClient();
  const { role } = await getEventRole(supabase, eventId);
  if (!role || role === "viewer") {
    return redirectToEvent("pinterest=error&reason=forbidden");
  }

  const redirectUri = `${url.origin}/api/pinterest/callback`;

  try {
    const token = await exchangeCodeForToken(code, redirectUri);
    const nowMs = Date.now();
    const { error: upsertError } = await supabase.from("pinterest_connections").upsert(
      {
        event_id: eventId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: new Date(nowMs + token.expires_in * 1000).toISOString(),
        refresh_token_expires_at: token.refresh_token_expires_in
          ? new Date(nowMs + token.refresh_token_expires_in * 1000).toISOString()
          : null,
        updated_at: new Date(nowMs).toISOString(),
      },
      { onConflict: "event_id" }
    );
    if (upsertError) {
      return redirectToEvent("pinterest=error&reason=save_failed");
    }
  } catch {
    return redirectToEvent("pinterest=error&reason=token_exchange_failed");
  }

  const response = redirectToEvent("pinterest=connected");
  response.cookies.delete("pinterest_oauth_nonce");
  return response;
}
