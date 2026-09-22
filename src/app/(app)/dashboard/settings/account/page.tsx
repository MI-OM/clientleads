import Link from "next/link";
import { getCurrentUser, requireUser } from "@/lib/auth/org";
import { createClient } from "@/lib/supabase/server";
import { AccountSettingsForms } from "./forms";

export default async function AccountSettingsPage() {
  await requireUser();
  const user = await getCurrentUser();

  let fullName: string | null = null;
  let phone: string | null = null;
  let avatarUrl: string | null = null;

  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    fullName = (data?.full_name as string | null) ?? null;
    phone = (data?.phone as string | null) ?? null;
    avatarUrl = (data?.avatar_url as string | null) ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
          <p className="text-sm text-muted-foreground">
            Your personal profile and sign-in details.
          </p>
        </div>
        <Link
          href="/dashboard/settings"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Business settings
        </Link>
      </div>

      <AccountSettingsForms
        fullName={fullName}
        phone={phone}
        avatarUrl={avatarUrl}
        email={user?.email ?? null}
      />
    </div>
  );
}