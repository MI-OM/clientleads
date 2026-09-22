import Link from "next/link";
import { getMyOrg } from "@/lib/auth/org";
import { BusinessSettingsForm } from "./business-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const ctx = await getMyOrg();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Your business profile, branding, and workspace details.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/settings/fields"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Custom fields
          </Link>
          <Link
            href="/dashboard/settings/account"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Account settings
          </Link>
        </div>
      </div>

      {ctx ? (
        <BusinessSettingsForm
          org={ctx.org}
          canEdit={ctx.role === "owner" || ctx.role === "admin"}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No workspace found</CardTitle>
            <CardDescription>
              Your account isn&apos;t linked to an organization yet. This usually means the database
              migrations haven&apos;t been applied.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Apply the migrations in <code className="font-mono">supabase/migrations</code> to your
              Supabase project, then refresh this page.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
