import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccountMenu from "./AccountMenu";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  gold: "#A8823C",
  line: "#E4DCC9",
};

export default async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.first_name) {
      displayName = profile.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile.first_name;
    }
  }

  const logoHref = user ? "/home" : "/";

  return (
    <header className="border-b" style={{ borderColor: C.line, backgroundColor: C.paper }}>
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          href={logoHref}
          className="text-xl"
          style={{ fontFamily: "Fraunces, serif", color: C.ink, textDecoration: "none" }}
        >
          SeatMe
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium" style={{ color: C.ink }}>
          {user && (
            <Link href="/events" style={{ color: C.ink, textDecoration: "none" }}>
              My events
            </Link>
          )}
          <Link href="/about" style={{ color: C.ink, textDecoration: "none" }}>
            About
          </Link>
          <Link href="/contact" style={{ color: C.ink, textDecoration: "none" }}>
            Contact
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <AccountMenu email={user.email ?? ""} displayName={displayName} />
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline text-sm font-medium" style={{ color: C.ink, textDecoration: "none" }}>
                Log in
              </Link>
              <Link
                href="/login"
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
