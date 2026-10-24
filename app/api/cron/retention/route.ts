import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily data-retention clean-up (scheduled in vercel.json). Keeps SeatMe
// from holding personal data longer than it needs to — the periods here are
// the ones stated in the privacy policy, so change both together.
//
// - Accounts that never confirmed their email: deleted 30 days after sign-up.
//   (They can't sign in or own events; their profile, logs and reminder rows
//   are removed with them by the database's cascades.)
// - Site-visit logs: deleted after 12 months.
// - Usage-limit records: deleted after 2 days (the longest limit window is 24h).
// - Floor plan and menu files whose event no longer exists: removed. Not done
//   at delete time because deleting an event can be undone for a few seconds.

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const UNCONFIRMED_ACCOUNT_DAYS = 30;
const SITE_VISIT_DAYS = 365;
const USAGE_EVENT_DAYS = 2;
const BUCKETS = ["floor-plans", "menus"] as const;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const result: Record<string, number | string> = {};
  const now = Date.now();

  // 1. Unconfirmed accounts.
  try {
    const cutoff = now - UNCONFIRMED_ACCOUNT_DAYS * DAY_MS;
    let deleted = 0;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const u of users) {
        if (!u.email_confirmed_at && new Date(u.created_at).getTime() < cutoff) {
          const { error: delError } = await admin.auth.admin.deleteUser(u.id);
          if (!delError) deleted++;
        }
      }
      if (users.length < 1000) break;
    }
    result.unconfirmedAccountsDeleted = deleted;
  } catch (e) {
    result.unconfirmedAccountsError = e instanceof Error ? e.message : String(e);
  }

  // 2. Old site-visit logs.
  try {
    const { count, error } = await admin
      .from("site_visits")
      .delete({ count: "exact" })
      .lt("visited_at", new Date(now - SITE_VISIT_DAYS * DAY_MS).toISOString());
    if (error) throw error;
    result.siteVisitsDeleted = count ?? 0;
  } catch (e) {
    result.siteVisitsError = e instanceof Error ? e.message : String(e);
  }

  // 3. Old usage-limit records.
  try {
    const { count, error } = await admin
      .from("usage_events")
      .delete({ count: "exact" })
      .lt("created_at", new Date(now - USAGE_EVENT_DAYS * DAY_MS).toISOString());
    if (error) throw error;
    result.usageEventsDeleted = count ?? 0;
  } catch (e) {
    result.usageEventsError = e instanceof Error ? e.message : String(e);
  }

  // 4. Files left behind by deleted events (files are stored under events/<event id>/).
  try {
    const { data: events, error } = await admin.from("events").select("id");
    if (error) throw error;
    const liveIds = new Set((events ?? []).map((e: { id: string }) => e.id));
    let removed = 0;
    for (const bucket of BUCKETS) {
      const { data: folders, error: listError } = await admin.storage.from(bucket).list("events", { limit: 1000 });
      if (listError) throw listError;
      for (const folder of folders ?? []) {
        if (liveIds.has(folder.name)) continue;
        const { data: files } = await admin.storage.from(bucket).list(`events/${folder.name}`, { limit: 1000 });
        const paths = (files ?? []).map((f: { name: string }) => `events/${folder.name}/${f.name}`);
        if (paths.length === 0) continue;
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (!removeError) removed += paths.length;
      }
    }
    result.orphanedFilesRemoved = removed;
  } catch (e) {
    result.orphanedFilesError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(result);
}
