// Shared helper for resolving the signed-in user's role on an event. Used by
// every API route and the event page, so access rules live in one place.
//
// The role comes from the `event_role(eid)` database function (see
// supabase/migrations/20261024100000_security_fixes.sql). It runs with
// elevated rights inside the database, which is why it can see the
// `event_members` row for the caller: RLS only lets owners read that table,
// so the old approach of reading event_members from the app silently
// returned nothing for invited editors and treated them as viewers.

export type EventRole = "owner" | "editor" | "viewer" | null;

// Returns the caller's role for the given event, or null if not signed in /
// no access / event doesn't exist.
export async function getEventRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventId: string
): Promise<{ role: EventRole; userId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null, userId: null };

  const { data, error } = await supabase.rpc("event_role", { eid: eventId });
  if (error) {
    // Safety net if this code runs before the migration that adds
    // event_role(): fall back to the old owner/member lookup rather than
    // locking everyone out.
    return { role: await legacyRole(supabase, eventId, user), userId: user.id };
  }
  if (data !== "owner" && data !== "editor" && data !== "viewer") {
    return { role: null, userId: user.id };
  }
  return { role: data, userId: user.id };
}

async function legacyRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventId: string,
  user: { id: string; email?: string }
): Promise<EventRole> {
  const { data: event, error } = await supabase.from("events").select("id, owner_id").eq("id", eventId).single();
  if (error || !event) return null;
  if (event.owner_id === user.id) return "owner";
  const { data: members } = await supabase.from("event_members").select("email, role").eq("event_id", eventId);
  const match = members?.find((m: { email: string }) => m.email.toLowerCase() === (user.email ?? "").toLowerCase());
  return (match?.role as "editor" | "viewer" | undefined) ?? "viewer";
}
