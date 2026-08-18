// Shared logic for nudging users who signed up but never completed their
// magic-link sign-in. Plain ESM (not TypeScript) so it can be imported both
// from the Next.js cron route (app/api/cron/activation-reminders/route.ts)
// and run directly as a standalone script (scripts/send-activation-reminders.mjs).
//
// A user is "eligible" if: they have no confirmed_at (never completed a
// sign-in), they signed up at least `minAgeHours` ago, and they haven't
// already been sent a reminder (tracked in public.activation_reminders, so
// this never re-sends to the same person twice).

async function listAllUsers(adminClient) {
  const perPage = 1000;
  let page = 1;
  let all = [];
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    all = all.concat(data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return all;
}

export async function sendActivationReminders({ adminClient, authClient, minAgeHours = 24 }) {
  const cutoff = new Date(Date.now() - minAgeHours * 60 * 60 * 1000);

  const users = await listAllUsers(adminClient);

  const candidates = users.filter(
    (u) => !u.confirmed_at && u.email && u.created_at && new Date(u.created_at) <= cutoff
  );

  if (candidates.length === 0) {
    return { candidates: 0, alreadyReminded: 0, sent: [], failed: [] };
  }

  const { data: alreadyRemindedRows, error: remindedErr } = await adminClient
    .from("activation_reminders")
    .select("user_id")
    .in("user_id", candidates.map((c) => c.id));
  if (remindedErr) throw remindedErr;
  const remindedSet = new Set((alreadyRemindedRows ?? []).map((r) => r.user_id));

  const toRemind = candidates.filter((c) => !remindedSet.has(c.id));

  const sent = [];
  const failed = [];

  for (const user of toRemind) {
    const { error: otpError } = await authClient.auth.signInWithOtp({ email: user.email });
    if (otpError) {
      failed.push({ email: user.email, reason: otpError.message });
      continue;
    }
    const { error: insertError } = await adminClient
      .from("activation_reminders")
      .insert({ user_id: user.id });
    if (insertError) {
      failed.push({ email: user.email, reason: `sent but failed to record: ${insertError.message}` });
      continue;
    }
    sent.push(user.email);
  }

  return {
    candidates: candidates.length,
    alreadyReminded: remindedSet.size,
    sent,
    failed,
  };
}
