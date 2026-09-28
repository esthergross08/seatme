import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface GuestRecord {
  id: string;
  name: string;
  note?: string;
  rsvpStatus?: "attending" | "pending" | "declined";
  mealChoice?: string;
  [key: string]: unknown;
}

interface EventData {
  guests?: GuestRecord[];
  seatAssignment?: Record<string, string>;
  rsvpConfig?: { collectComments?: boolean; mealOptions?: string[] };
  [key: string]: unknown;
}

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  let body: { action?: string; name?: string; guestId?: string; rsvpStatus?: string; mealChoice?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "RSVP isn't set up yet on this server — the site owner needs to add a service role key." },
      { status: 500 }
    );
  }

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, rsvp_enabled, data")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "We couldn't find this event." }, { status: 404 });
  }
  if (!event.rsvp_enabled) {
    return NextResponse.json({ error: "RSVP isn't open for this event." }, { status: 403 });
  }

  const data: EventData = event.data || {};
  const guests: GuestRecord[] = Array.isArray(data.guests) ? data.guests : [];

  if (body.action === "lookup") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }
    const target = normalizeName(name);
    const matches = guests.filter((g) => normalizeName(g.name || "") === target);

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "We couldn't find that name on the guest list. Double-check the spelling, or reach out to the couple directly." },
        { status: 404 }
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          error:
            "There's more than one guest with that name — try entering your full name exactly as it appears on your invitation, or contact the couple directly.",
        },
        { status: 409 }
      );
    }

    const g = matches[0];
    return NextResponse.json({
      guestId: g.id,
      name: g.name,
      rsvpStatus: g.rsvpStatus ?? "pending",
      mealChoice: g.mealChoice ?? "",
      note: g.note ?? "",
    });
  }

  if (body.action === "submit") {
    const guestId = typeof body.guestId === "string" ? body.guestId : "";
    const rsvpStatus = body.rsvpStatus;
    let mealChoice = typeof body.mealChoice === "string" ? body.mealChoice.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (rsvpStatus !== "attending" && rsvpStatus !== "declined") {
      return NextResponse.json({ error: "Please choose whether you're attending." }, { status: 400 });
    }

    // The planner defines the exact menu — guests pick from that list, never free
    // text. Enforce it here too, since this endpoint is public and unauthenticated
    // and the client-side <select> alone wouldn't stop a direct API call.
    const configuredMealOptions = data.rsvpConfig?.mealOptions ?? [];
    if (configuredMealOptions.length === 0) {
      mealChoice = "";
    } else if (mealChoice && !configuredMealOptions.includes(mealChoice)) {
      return NextResponse.json({ error: "That meal choice isn't one of the options offered. Please pick from the list." }, { status: 400 });
    }
    const idx = guests.findIndex((g) => g.id === guestId);
    if (idx === -1) {
      return NextResponse.json({ error: "We couldn't find your invitation — try looking yourself up again." }, { status: 404 });
    }

    const updatedGuests = guests.slice();
    updatedGuests[idx] = {
      ...updatedGuests[idx],
      rsvpStatus,
      mealChoice: mealChoice || undefined,
      note: note || undefined,
    };

    // Mirror the app's own behavior: declining frees whatever seat they were
    // assigned, so the planner's seated/unseated counts stay accurate.
    let seatAssignment = data.seatAssignment;
    if (rsvpStatus === "declined" && seatAssignment) {
      const next = { ...seatAssignment };
      const fromSeatId = Object.keys(next).find((sid) => next[sid] === guestId);
      if (fromSeatId) delete next[fromSeatId];
      seatAssignment = next;
    }

    const newData: EventData = { ...data, guests: updatedGuests, seatAssignment };
    const { error: updateError } = await admin.from("events").update({ data: newData }).eq("id", eventId);
    if (updateError) {
      return NextResponse.json({ error: "Couldn't save your RSVP. Try again in a bit." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
