import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountForm from "@/components/AccountForm";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#736D5F",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, recovery_phone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="max-w-xl mx-auto px-6 py-16 sm:py-20">
      <div className="text-xs tracking-[0.2em] uppercase font-semibold mb-3" style={{ color: C.gold }}>
        Account
      </div>
      <h1 className="text-3xl mb-2" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
        My info
      </h1>
      <p className="text-sm mb-8" style={{ color: C.muted }}>
        {user.email}
      </p>

      <div className="p-6 sm:p-8 rounded-2xl border" style={{ borderColor: C.line, backgroundColor: "#fff" }}>
        <AccountForm
          initialFirstName={profile?.first_name ?? ""}
          initialLastName={profile?.last_name ?? ""}
          initialRecoveryPhone={profile?.recovery_phone ?? ""}
        />
      </div>
    </div>
  );
}
