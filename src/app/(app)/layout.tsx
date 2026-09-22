import type { ReactNode } from "react";
import { AppShell } from "@/components/dashboard/app-shell";
import { getCurrentUser, getMyOrg } from "@/lib/auth/org";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const ctx = await getMyOrg();

  return (
    <AppShell
      user={
        user
          ? {
              name: user.user_metadata?.full_name ?? null,
              email: user.email ?? null,
            }
          : null
      }
      orgName={ctx?.org.name ?? null}
    >
      {children}
    </AppShell>
  );
}
