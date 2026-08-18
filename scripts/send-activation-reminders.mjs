// Manually resend a sign-in link to anyone who signed up 24h+ ago and never
// completed it. Uses the same logic as the automatic daily cron
// (app/api/cron/activation-reminders/route.ts) via lib/activationReminders.mjs,
// and records who's been reminded in public.activation_reminders — so running
// this and then letting the daily cron run later won't double-send to anyone.
//
// Requires the same SUPABASE_SERVICE_ROLE_KEY set up for admin-report.mjs.
// See scripts/admin-report.mjs for where to find that key.
//
// Usage:
//   npm run send-activation-reminders

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { sendActivationReminders } from "../lib/activationReminders.mjs";

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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    "\nMissing config. Make sure .env.local has:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=...\n" +
      "  NEXT_PUBLIC_SUPABASE_ANON_KEY=...\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=...\n"
  );
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Checking for signed-up-but-never-confirmed users (24h+ old)…");
  const result = await sendActivationReminders({ adminClient, authClient, minAgeHours: 24 });

  console.log(`\n${result.candidates} eligible (unconfirmed, 24h+ old).`);
  console.log(`${result.alreadyReminded} already reminded previously (skipped).`);
  console.log(`${result.sent.length} reminder(s) sent just now:`);
  result.sent.forEach((email) => console.log(`  - ${email}`));

  if (result.failed.length > 0) {
    console.log(`\n${result.failed.length} failed:`);
    result.failed.forEach(({ email, reason }) => console.log(`  - ${email}: ${reason}`));
  }
  console.log("");
}

main().catch((err) => {
  console.error("\nFailed to send reminders:", err.message || err);
  process.exit(1);
});
