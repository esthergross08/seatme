// Usage limits for costly or public endpoints, counted server-side in the
// `usage_events` table (no client access; written with the service key).
//
// - AI features are capped per user per day, so one account can't run up
//   the Anthropic bill.
// - The public RSVP endpoint is capped per visitor per event, so a guest list
//   can't be probed name by name.
//
// If the table is missing or the database errors, the request is allowed
// (fail open) and the problem is logged — a broken limiter shouldn't take the
// app down with it.

import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;

export const USAGE_LIMITS = {
  /** Messages to the seating assistant. */
  assistant: { max: 100, windowMs: DAY_MS, message: "You've reached today's limit of 100 assistant messages. It resets within 24 hours." },
  /** Floor plan / menu reading and Pinterest-based suggestions. */
  analysis: { max: 20, windowMs: DAY_MS, message: "You've reached today's limit of 20 AI analyses. It resets within 24 hours." },
  /** Name lookups and submissions on a public RSVP page. */
  rsvp: { max: 30, windowMs: 10 * 60 * 1000, message: "Too many attempts. Please wait a few minutes and try again." },
} as const;

export type UsageKind = keyof typeof USAGE_LIMITS;

/**
 * Records one use and returns whether it's within the limit. Over the limit,
 * nothing is recorded and `allowed` is false with a message for the user.
 */
export async function checkUsage(kind: UsageKind, subject: string): Promise<{ allowed: boolean; message?: string }> {
  const limit = USAGE_LIMITS[kind];
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - limit.windowMs).toISOString();
    const { count, error } = await admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("subject", subject)
      .eq("kind", kind)
      .gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= limit.max) return { allowed: false, message: limit.message };
    const { error: insertError } = await admin.from("usage_events").insert({ subject, kind });
    if (insertError) throw insertError;
    return { allowed: true };
  } catch (e) {
    console.error(`usage limit check failed (${kind}); allowing request`, e);
    return { allowed: true };
  }
}

/**
 * A non-reversible id for an anonymous visitor (IP + scope), so the RSVP
 * limit never stores a raw IP address. Uses the same salt as the visit
 * tracker when set.
 */
export function anonymousSubject(request: Request, scope: string): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.VISIT_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return "anon:" + createHash("sha256").update(`${ip}|${scope}|${salt}`).digest("hex").slice(0, 32);
}
