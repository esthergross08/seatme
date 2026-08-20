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
//   5. (Optional but recommended) For "unique visitors" on site traffic to
//      work, generate a random salt yourself — e.g. run this once in a
//      terminal: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//      — and add it to BOTH .env.local and your Vercel project's environment
//      variables as VISIT_HASH_SALT. Page views still get logged without it;
//      only the unique-visitor estimate depends on it.
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

function loadHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return [];
  try {
    const raw = fs.readFileSync(historyPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(historyPath, history) {
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8");
}

// Hand-rolled SVG line chart — no external chart library, so this still
// renders correctly when the report is opened offline via a file:// URL.
// `series` is a list of { key, label, color } describing which fields of each
// history entry to plot, so this one function drives every trend chart in the
// report rather than hardcoding a single fixed set of lines.
function buildTrendChart(history, series) {
  const W = 1020;
  const H = 260;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVal = Math.max(4, ...history.flatMap((h) => series.map((s) => h[s.key] ?? 0))) * 1.15;

  const xAt = (i) => padL + (history.length === 1 ? plotW / 2 : (i / (history.length - 1)) * plotW);
  const yAt = (v) => padT + plotH - (v / maxVal) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + plotH * (1 - f);
    const val = Math.round(maxVal * f);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" stroke-width="1" />
      <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${val}</text>`;
  }).join("");

  const labelStep = Math.max(1, Math.ceil(history.length / 8));
  const xLabels = history
    .map((h, i) => (i % labelStep === 0 || i === history.length - 1
      ? `<text x="${xAt(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${h.date.slice(5)}</text>`
      : ""))
    .join("");

  const lines = series
    .map((s) => {
      const points = history.map((h, i) => `${xAt(i)},${yAt(h[s.key] ?? 0)}`).join(" ");
      const dots = history
        .map((h, i) => `<circle cx="${xAt(i)}" cy="${yAt(h[s.key] ?? 0)}" r="3" fill="${s.color}"><title>${esc(h.date)} — ${s.label}: ${h[s.key] ?? 0}</title></circle>`)
        .join("");
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" /> ${dots}`;
    })
    .join("");

  const legend = series
    .map((s, i) => `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;">
      <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></span>
      <span style="font-size:12px;color:var(--muted);">${esc(s.label)}</span>
    </span>`)
    .join("");

  return `
    <div class="chart-legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img">
      ${gridLines}
      ${lines}
      ${xLabels}
    </svg>`;
}

const ACCOUNT_TREND_SERIES = [
  { key: "totalUsers", label: "Total users", color: "var(--gold)" },
  { key: "activeUsers", label: "Active users (7d)", color: "var(--sage)" },
  { key: "totalEvents", label: "Total events", color: "var(--wine)" },
];

const TRAFFIC_TREND_SERIES = [
  { key: "pageViews", label: "Page views", color: "var(--gold)" },
  { key: "uniqueVisitors", label: "Unique visitors", color: "#4A6FA5" },
  { key: "anonymousVisitors", label: "Anonymous (not signed in)", color: "var(--muted)" },
];

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

  const [users, profilesRes, eventsRes, membersRes, accessRes, importRes, visitsRes] = await Promise.all([
    fetchAllUsers(),
    supabase.from("profiles").select("id, first_name, last_name"),
    supabase.from("events").select("id, owner_id, name, created_at, updated_at"),
    supabase.from("event_members").select("event_id, email, role"),
    supabase.from("access_log").select("user_id, access_day"),
    supabase.from("import_log").select("user_id, guest_count, mode, had_rsvp_data, had_meal_data, created_at"),
    supabase
      .from("site_visits")
      .select("user_id, path, referrer, utm_source, utm_medium, utm_campaign, visitor_hash, visited_at"),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (membersRes.error) throw membersRes.error;
  if (accessRes.error) throw accessRes.error;
  if (importRes.error) throw importRes.error;
  if (visitsRes.error) throw visitsRes.error;

  const profiles = profilesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const members = membersRes.data ?? [];
  const accessRows = accessRes.data ?? [];
  const importRows = importRes.data ?? [];
  const visitRows = visitsRes.data ?? [];

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

  // Site visits: covers the public marketing pages, including visitors who
  // never sign up — access_log above only ever sees people who already have
  // an account. "Unique visitors" is estimated from a same-day, salted hash
  // of IP+user-agent (set by the middleware) rather than a real identity, so
  // it's a rough count, not exact — rows logged before VISIT_HASH_SALT was
  // set (or if it's still unset) have no hash and are excluded from that
  // count specifically, though they still count as page views.
  const pageViews7 = visitRows.filter((r) => new Date(r.visited_at) >= cutoff7).length;
  const pageViews30 = visitRows.filter((r) => new Date(r.visited_at) >= cutoff30).length;
  const uniqueVisitors7 = new Set(
    visitRows.filter((r) => r.visitor_hash && new Date(r.visited_at) >= cutoff7).map((r) => r.visitor_hash)
  ).size;
  const uniqueVisitors30 = new Set(
    visitRows.filter((r) => r.visitor_hash && new Date(r.visited_at) >= cutoff30).map((r) => r.visitor_hash)
  ).size;
  const anonymousVisits30 = visitRows.filter((r) => !r.user_id && new Date(r.visited_at) >= cutoff30).length;
  const hasAnyVisitData = visitRows.length > 0;
  const hasVisitorHashes = visitRows.some((r) => r.visitor_hash);

  function sourceOf(row) {
    if (row.utm_source) return row.utm_source;
    if (!row.referrer) return "(direct)";
    try {
      return new URL(row.referrer).hostname || row.referrer;
    } catch {
      return row.referrer;
    }
  }

  const pageCounts30 = {};
  const sourceCounts30 = {};
  for (const r of visitRows) {
    if (new Date(r.visited_at) < cutoff30) continue;
    pageCounts30[r.path || "(unknown)"] = (pageCounts30[r.path || "(unknown)"] ?? 0) + 1;
    const source = sourceOf(r);
    sourceCounts30[source] = (sourceCounts30[source] ?? 0) + 1;
  }
  const topPages = Object.entries(pageCounts30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topSources = Object.entries(sourceCounts30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Trend history: one data point per day, upserted so re-running the report
  // multiple times in a day just updates today's numbers instead of duplicating.
  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const historyPath = path.join(outDir, "admin-history.json");
  const history = loadHistory(historyPath);
  const today = fmtDate(new Date());
  const todayVisitRows = visitRows.filter((r) => fmtDate(r.visited_at) === today);
  const todayEntry = {
    date: today,
    totalUsers,
    activeUsers: activeInApp7,
    totalEvents,
    pageViews: todayVisitRows.length,
    uniqueVisitors: new Set(todayVisitRows.filter((r) => r.visitor_hash).map((r) => r.visitor_hash)).size,
    anonymousVisitors: todayVisitRows.filter((r) => !r.user_id).length,
  };
  const existingIdx = history.findIndex((h) => h.date === today);
  if (existingIdx >= 0) history[existingIdx] = todayEntry;
  else history.push(todayEntry);
  history.sort((a, b) => a.date.localeCompare(b.date));
  saveHistory(historyPath, history);

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
  .chart-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px 18px 6px;
    margin-bottom: 24px;
  }
  .chart-title {
    font-family: 'Fraunces', serif;
    font-size: 16px;
    margin-bottom: 8px;
  }
  .chart-legend { margin-bottom: 6px; }
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
      ${statCard("Page views (7d)", pageViews7)}
      ${statCard("Page views (30d)", pageViews30)}
      ${statCard("Unique visitors (7d)", uniqueVisitors7)}
      ${statCard("Unique visitors (30d)", uniqueVisitors30)}
      ${statCard("Anonymous visits (30d)", anonymousVisits30)}
    </div>

    <div class="chart-card">
      <div class="chart-title">Trend — total users, active users (7d), total events</div>
      ${
        history.length < 2
          ? `<div class="note" style="margin-bottom:0;">Only ${history.length} day${history.length === 1 ? "" : "s"} of data so far — run this report again on a later day to start seeing a trend line. Each run records one data point for today (re-running the same day just updates it).</div>`
          : buildTrendChart(history, ACCOUNT_TREND_SERIES)
      }
    </div>

    <div class="chart-card">
      <div class="chart-title">Trend — site traffic (page views, unique visitors, anonymous)</div>
      ${
        history.length < 2
          ? `<div class="note" style="margin-bottom:0;">Only ${history.length} day${history.length === 1 ? "" : "s"} of data so far — run this report again on a later day to start seeing a trend line.</div>`
          : buildTrendChart(history, TRAFFIC_TREND_SERIES)
      }
    </div>

    ${
      !hasAnyVisitData
        ? `<div class="note">No site visits logged yet — this is a brand-new feature (2026-08-19). Once people (including anonymous visitors) load the homepage/about/contact/login pages, they'll start showing up here. If you haven't set <code>VISIT_HASH_SALT</code> in <code>.env.local</code> and Vercel yet, page views will still count but "unique visitors" will read 0 until it's set.</div>`
        : !hasVisitorHashes
        ? `<div class="note">Page views are being logged, but none have a visitor hash yet — set <code>VISIT_HASH_SALT</code> in <code>.env.local</code> and your Vercel project's environment variables to start estimating unique visitors (not required, but recommended).</div>`
        : ""
    }

    ${
      topPages.length > 0
        ? `<div class="chart-card">
            <div class="chart-title">Top pages (30d)</div>
            <table><thead><tr><th>Path</th><th>Views</th></tr></thead><tbody>
              ${topPages.map(([p, c]) => `<tr><td class="muted">${esc(p)}</td><td>${c}</td></tr>`).join("")}
            </tbody></table>
          </div>`
        : ""
    }

    ${
      topSources.length > 0
        ? `<div class="chart-card">
            <div class="chart-title">Top sources / referrers (30d)</div>
            <table><thead><tr><th>Source</th><th>Visits</th></tr></thead><tbody>
              ${topSources.map(([s, c]) => `<tr><td class="muted">${esc(s)}</td><td>${c}</td></tr>`).join("")}
            </tbody></table>
          </div>`
        : ""
    }

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
