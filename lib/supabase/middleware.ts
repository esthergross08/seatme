import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest, after } from "next/server";

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

  return supabaseResponse;
}
