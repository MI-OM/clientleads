import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { getDashboardCounts } from "@/lib/crm/queries";
import { countUpcomingAppointments } from "@/lib/booking/queries";
import { countPendingTasks } from "@/lib/tasks/queries";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

export default async function DashboardPage() {
  const configured = isSupabaseConfigured();
  const ctx = await getMyOrg();
  const counts = ctx ? await getDashboardCounts(ctx.org.id) : null;
  const upcomingAppointments = ctx
    ? await countUpcomingAppointments(ctx.org.id, new Date().toISOString())
    : null;
  const pendingTasks = ctx ? await countPendingTasks(ctx.org.id) : null;

  const linkAction = (href: string, label: string) => (
    <Link href={href} className={buttonVariants({ variant: "outline" })}>
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="An action-oriented overview of your business." />

      {!configured ? (
        <Card className="border-warning bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-amber-900">Supabase is not configured yet</p>
              <p className="mt-1 text-amber-800/80">
                Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
                <code className="rounded bg-amber-100 px-1">.env.local</code>, add your project URL
                and anon key, then restart{" "}
                <code className="rounded bg-amber-100 px-1">next dev</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts?.contacts.toLocaleString() ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active (not archived)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open leads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{counts?.openLeads.toLocaleString() ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">All stages except Won / Lost</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Upcoming appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {upcomingAppointments?.toLocaleString() ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Scheduled + confirmed, from now on</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{pendingTasks?.toLocaleString() ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Open or in progress</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {linkAction("/dashboard/contacts/new", "Add contact")}
          {linkAction("/dashboard/leads/new", "Create lead")}
          <Link
            href="/dashboard/contacts/import"
            className={buttonVariants({ variant: "outline" })}
          >
            Import contacts
          </Link>
          <Link href="/dashboard/availability" className={buttonVariants({ variant: "outline" })}>
            Set availability
          </Link>
          <Link href="/dashboard/appointments" className={buttonVariants({ variant: "outline" })}>
            View appointments
          </Link>
          <Link href="/dashboard/campaigns/new" className={buttonVariants({ variant: "outline" })}>
            New campaign
          </Link>
          <Link href="/dashboard/tasks/new" className={buttonVariants({ variant: "outline" })}>
            New task
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
