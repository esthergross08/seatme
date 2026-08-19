// Local-only usage dashboard for SeatMe.
//
// This script is never deployed and never runs on Vercel — it's meant to be run
// from your own machine with `npm run admin:report`. It uses the Supabase
// *service role* key (which bypasses all row-level security) to pull every
// user's account info, events, and in-app activity, then writes a single
// static HTML file to reports/admin-report.html that you open in a browser.
//
// Setup (one-time):
//   1. Go to the Supabase dashboard → your project → Project Settings → API.
//   2. Copy the "service_role" secret key (NOT the anon/publishable key).
//   3. Add a new line to your local .env.local file:
//        SUPABASE_SERVICE_ROLE_KEY=<paste it here>
//   4. Never commit that key or share it — it has full read/write access to
//      the whole database. reports/ is already gitignored.
//
// Usage:
//   npm run admin:report
//   then open reports/admin-report.html in your browser.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "\nMissing config. Make sure .env.local has both:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=...\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=...\n\n" +
      "The service role key is in the Supabase dashboard under\n" +
      "Project Settings -> API -> service_role secret key.\n"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAllUsers() {
  const perPage = 1000;
  let page = 1;
  let all = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    all = all.concat(data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return all;
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function main() {
  console.log("Pulling data from Supabase…");

  const [users, profilesRes, eventsRes, membersRes, accessRes, importRes] = await Promise.all([
    fetchAllUsers(),
    supabase.from("profiles").select("id, first_name, last_name"),
    supabase.from("events").select("id, owner_id, name, created_at, updated_at"),
    supabase.from("event_members").select("event_id, email, role"),
    supabase.from("access_log").select("user_id, access_day"),
    supabase.from("import_log").select("user_id, guest_count, mode, had_rsvp_data, had_meal_data, created_at"),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (membersRes.error) throw membersRes.error;
  if (accessRes.error) throw accessRes.error;
  if (importRes.error) throw importRes.error;

  const profiles = profilesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const members = membersRes.data ?? [];
  const accessRows = accessRes.data ?? [];
  const importRows = importRes.data ?? [];

  const profileById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const emailToUserId = Object.fromEntries(
    users.map((u) => [(u.email ?? "").toLowerCase(), u.id])
  );

  const eventsByOwner = {};
  for (const ev of events) {
    (eventsByOwner[ev.owner_id] ??= []).push(ev);
  }

  const sharedCountByUser = {};
  for (const m of members) {
    const uid = emailToUserId[(m.email ?? "").toLowerCase()];
    if (!uid) continue;
    const ev = events.find((e) => e.id === m.event_id);
    if (ev && ev.owner_id === uid) continue; // owns it, don't double count
    sharedCountByUser[uid] = (sharedCountByUser[uid] ?? 0) + 1;
  }

  const accessDaysByUser = {};
  for (const row of accessRows) {
    (accessDaysByUser[row.user_id] ??= []).push(row.access_day);
  }

  const importsByUser = {};
  for (const row of importRows) {
    if (!row.user_id) continue;
    (importsByUser[row.user_id] ??= []).push(row);
  }

  const cutoff7 = daysAgo(7);
  const cutoff30 = daysAgo(30);

  const rows = users.map((u) => {
    const profile = profileById[u.id];
    const name = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
      : "";
    const ownedEvents = eventsByOwner[u.id] ?? [];
    const accessDays = (accessDaysByUser[u.id] ?? []).slice().sort();
    const lastActiveDay = accessDays.length ? accessDays[accessDays.length - 1] : null;
    const activeDaysLast30 = accessDays.filter((d) => new Date(d) >= cutoff30).length;

    const lastActiveTs = lastActiveDay ? new Date(lastActiveDay).getTime() : 0;
    const lastSignInTs = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
    const createdTs = u.created_at ? new Date(u.created_at).getTime() : 0;
    const sortKey = Math.max(lastActiveTs, lastSignInTs, createdTs);

    const imports = (importsByUser[u.id] ?? []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lastImport = imports.length ? imports[imports.length - 1] : null;

    return {
      id: u.id,
      email: u.email ?? "(no email)",
      name: name || null,
      createdAt: fmtDate(u.created_at),
      confirmed: !!u.confirmed_at,
      lastSignIn: fmtDate(u.last_sign_in_at),
      lastActiveDay: fmtDate(lastActiveDay),
      activeDaysTotal: accessDays.length,
      activeDaysLast30,
      eventsOwned: ownedEvents.length,
      eventsShared: sharedCountByUser[u.id] ?? 0,
      importsCount: imports.length,
      lastImportDate: fmtDate(lastImport?.created_at),
      sortKey,
    };
  });

  rows.sort((a, b) => b.sortKey - a.sortKey);

  const totalUsers = users.length;
  const totalEvents = events.length;
  const confirmedUsers = users.filter((u) => u.confirmed_at).length;
  const newUsers7 = users.filter((u) => u.created_at && new Date(u.created_at) >= cutoff7).length;
  const newUsers30 = users.filter((u) => u.created_at && new Date(u.created_at) >= cutoff30).length;
  const zeroEventUsers = rows.filter((r) => r.eventsOwned === 0).length;
  const activeInApp7 = new Set(
    accessRows.filter((r) => new Date(r.access_day) >= cutoff7).map((r) => r.user_id)
  ).size;
  const activeInApp30 = new Set(
    accessRows.filter((r) => new Date(r.access_day) >= cutoff30).map((r) => r.user_id)
  ).size;
  const hasAnyAccessData = accessRows.length > 0;

  const totalImports = importRows.length;
  const usersWithImports = new Set(importRows.map((r) => r.user_id)).size;
  const importsWithRsvp = importRows.filter((r) => r.had_rsvp_data).length;
  const importsWithMeal = importRows.filter((r) => r.had_meal_data).length;
  const totalGuestsImported = importRows.reduce((sum, r) => sum + (r.guest_count || 0), 0);

  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const statCard = (label, value) => `
    <div class="stat">
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`;

  const tableRows = rows
    .map((r) => {
      return `
      <tr>
        <td class="name">${esc(r.name || "—")}</td>
        <td class="muted">${esc(r.email)}</td>
        <td>${esc(r.createdAt ?? "—")}</td>
        <td class="${r.confirmed ? "sage" : "wine"}">${r.confirmed ? "Yes" : "No"}</td>
        <td>${esc(r.lastSignIn ?? "Never")}</td>
        <td>${esc(r.lastActiveDay ?? "—")}</td>
        <td>${r.activeDaysLast30}</td>
        <td class="${r.eventsOwned === 0 ? "wine" : ""}">${r.eventsOwned}</td>
        <td>${r.eventsShared}</td>
        <td>${r.importsCount}</td>
        <td>${esc(r.lastImportDate ?? "—")}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SeatMe — Usage report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
  :root {
    --ink: #221F2B;
    --paper: #F7F3EA;
    --card: #FFFFFF;
    --gold: #A8823C;
    --goldSoft: #E7D9B8;
    --line: #E4DCC9;
    --muted: #8A8272;
    --sage: #54704F;
    --wine: #8C3B3B;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Inter', sans-serif;
    padding: 40px 24px 80px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--gold);
    margin-bottom: 4px;
  }
  h1 {
    font-family: 'Fraunces', serif;
    font-size: 30px;
    margin: 0 0 4px;
  }
  .generated { font-size: 12px; color: var(--muted); margin-bottom: 28px; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 28px;
  }
  .stat {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .stat-value {
    font-family: 'Fraunces', serif;
    font-size: 24px;
    color: var(--ink);
  }
  .stat-label {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  .note {
    font-size: 12px;
    color: var(--muted);
    background: var(--goldSoft);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 24px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    font-size: 13px;
  }
  th, td {
    text-align: left;
    padding: 9px 12px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  th {
    background: var(--paper);
    color: var(--muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }
  tr:last-child td { border-bottom: none; }
  td.name { font-family: 'Fraunces', serif; font-weight: 500; }
  td.muted { color: var(--muted); }
  td.sage { color: var(--sage); font-weight: 600; }
  td.wine { color: var(--wine); font-weight: 600; }
  .table-scroll { overflow-x: auto; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">SeatMe — internal</div>
    <h1>Usage report</h1>
    <div class="generated">Generated ${esc(generatedAt)} · local snapshot, not live</div>

    <div class="stats">
      ${statCard("Total users", totalUsers)}
      ${statCard("Confirmed users", confirmedUsers)}
      ${statCard("New users (7d)", newUsers7)}
      ${statCard("New users (30d)", newUsers30)}
      ${statCard("Total events", totalEvents)}
      ${statCard("Users with 0 events", zeroEventUsers)}
      ${statCard("Active in app (7d)", activeInApp7)}
      ${statCard("Active in app (30d)", activeInApp30)}
      ${statCard("Files imported", totalImports)}
      ${statCard("Users who've imported", usersWithImports)}
      ${statCard("Guests imported (total)", totalGuestsImported)}
      ${statCard("Imports with RSVP data", importsWithRsvp)}
      ${statCard("Imports with meal data", importsWithMeal)}
    </div>

    ${
      !hasAnyAccessData
        ? `<div class="note">"Last seen in app" and "active in app" columns are powered by a new access log that only starts recording from when this feature was deployed — there's no historical data yet, so these will read empty/zero until users visit again. "Last sign-in" (from Supabase auth) still reflects full history.</div>`
        : `<div class="note">"Last seen in app" and "active in app" are based on actual page visits (once-per-day-per-user), tracked since this feature was added — they won't reflect any activity from before then. "Last sign-in" is Supabase's own auth timestamp and covers full history.</div>`
    }

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Signed up</th>
            <th>Confirmed</th>
            <th>Last sign-in</th>
            <th>Last seen in app</th>
            <th>Active days (30d)</th>
            <th>Events owned</th>
            <th>Events shared with</th>
            <th>Files imported</th>
            <th>Last import</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "admin-report.html");
  fs.writeFileSync(outPath, html, "utf8");

  console.log(`\nDone. ${totalUsers} users, ${totalEvents} events.`);
  console.log(`Report written to: ${outPath}`);
  console.log(`Open it in your browser to view.\n`);
}

main().catch((err) => {
  console.error("\nFailed to generate report:", err.message || err);
  process.exit(1);
});
