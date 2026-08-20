import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest, after } from "next/server";

// Privacy-preserving per-visitor identifier: SHA-256 of (IP + user agent + calendar
// day + a server-only salt), so we can count roughly how many distinct people
// visited without ever storing a raw IP address or anything reversible to one.
// The day component means the hash naturally rotates daily — no long-lived
// cross-session tracking identifier. Uses Web Crypto (crypto.subtle), which is
// available in the Edge middleware runtime (Node's `crypto` module is not).
async function hashVisitor(request: NextRequest): Promise<string | null> {
  const salt = process.env.VISIT_HASH_SALT;
  if (!salt) return null; // logging still proceeds without a visitor hash
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const input = `${ip}|${ua}|${day}|${salt}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/privacy") ||
    path.startsWith("/terms") ||
    path.startsWith("/about") ||
    path.startsWith("/contact");

  // API routes handle their own auth (some require a signed-in user, some —
  // like the cron endpoints and the anonymous feedback form — intentionally
  // don't) and should return a proper status code, not a redirect a fetch()
  // call can't follow usefully. Never gate them here.
  if (!user && !isPublicRoute && !path.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // Best-effort usage tracking: one row per signed-in user per calendar day,
  // scoped to actual page loads (not API calls or data fetches). Failures are
  // ignored so this can never block or slow down navigation.
  if (user && request.method === "GET" && !path.startsWith("/api")) {
    after(async () => {
      try {
        await supabase
          .from("access_log")
          .upsert({ user_id: user.id }, { onConflict: "user_id,access_day", ignoreDuplicates: true });
      } catch {
        // best-effort only — never let logging affect navigation
      }
    });
  }

  // Site visit tracking: every page load to a public marketing page, whether
  // the visitor is signed in or completely anonymous — this is the top of the
  // funnel access_log above can't see (nobody has an account yet). One row per
  // visit (not deduped) so page-view counts are accurate; unique-visitor counts
  // are computed later from the hashed visitor id. Also captures UTM params so
  // the Instagram bio link (or any other campaign link) can be attributed.
  if (isPublicRoute && request.method === "GET") {
    after(async () => {
      try {
        const params = request.nextUrl.searchParams;
        await supabase.from("site_visits").insert({
          user_id: user?.id ?? null,
          path,
          referrer: request.headers.get("referer") || null,
          user_agent: request.headers.get("user-agent") || null,
          utm_source: params.get("utm_source"),
          utm_medium: params.get("utm_medium"),
          utm_campaign: params.get("utm_campaign"),
          visitor_hash: await hashVisitor(request),
        });
      } catch {
        // best-effort only — never let logging affect navigation
      }
    });
  }

  return supabaseResponse;
}
