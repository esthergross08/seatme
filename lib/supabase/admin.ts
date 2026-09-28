import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses Row Level Security entirely. Server-only:
// never import this from a "use client" file or anything that could end up
// in a browser bundle. Currently used only by the public guest-RSVP route
// (app/api/rsvp/[id]/route.ts), which needs to read/update one specific
// guest's fields inside an event's `data` blob on behalf of an anonymous,
// unauthenticated visitor — something normal RLS can't safely scope down to
// "just this one guest's rsvpStatus/mealChoice/note", so we mediate access
// entirely in application code instead of opening up a broader public policy.
//
// Requires SUPABASE_SERVICE_ROLE_KEY to be set wherever this runs, including
// on Vercel (Project Settings -> Environment Variables) — it was previously
// only needed locally for the admin-report script, so this is a new
// requirement for production once the RSVP feature is deployed.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
