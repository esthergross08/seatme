import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SeatingPlanner from "@/components/SeatingPlanner";
import { getEventRole } from "@/lib/eventAccess";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !event) notFound();

  const { data: members } = await supabase
    .from("event_members")
    .select("email, role")
    .eq("event_id", id);

  const { role } = await getEventRole(supabase, id);
  if (!role) notFound();

  return (
    <Suspense fallback={null}>
      <SeatingPlanner
        eventId={event.id}
        initialName={event.name ?? "Untitled event"}
        initialData={event.data ?? null}
        role={role}
        members={members ?? []}
        initialEventDate={event.event_date ?? null}
        initialLocation={event.location ?? null}
        initialMaxCapacity={event.max_capacity ?? null}
        initialRsvpEnabled={event.rsvp_enabled ?? false}
        initialUpdatedAt={event.updated_at ?? null}
      />
    </Suspense>
  );
}
