// Shared helper for API routes: resolves the signed-in user's role on an
// event, mirroring the logic in app/events/[id]/page.tsx and
// app/api/agent/route.ts.

export type EventRole = "owner" | "editor" | "viewer" | null;

// Returns the caller's role for the given event, or null if not signed in /
// event doesn't exist. Relies on RLS already restricting the `events` select
// to rows the user can see, so a successful lookup implies at least member
// access; role is refined against event_members for the exact permission level.
export async function getEventRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventId: string
): Promise<{ role: EventRole; userId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null, userId: null };

  const { data: event, error } = await supabase.from("events").select("id, owner_id").eq("id", eventId).single();
  if (error || !event) return { role: null, userId: user.id };

  if (event.owner_id === user.id) return { role: "owner", userId: user.id };

  const { data: members } = await supabase.from("event_members").select("email, role").eq("event_id", eventId);
  const role = (members?.find((m: { email: string }) => m.email === user.email)?.role as
    | "editor"
    | "viewer"
    | undefined) ?? "viewer";
  return { role, userId: user.id };
}
