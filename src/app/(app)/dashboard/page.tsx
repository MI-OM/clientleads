import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

const stats = [
  { label: "Total contacts", hint: "Contacts module lands in M2 (CRM)" },
  { label: "Open leads", hint: "Leads module lands in M2 (CRM)" },
  { label: "Upcoming appointments", hint: "Booking lands in M4" },
  { label: "Pending tasks", hint: "Tasks land in M6" },
] as const;

const quickActions = [
  "Add contact",
  "Create lead",
  "Book appointment",
  "New campaign",
] as const;

export default function DashboardPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="An action-oriented overview of your business. Metrics populate as modules ship."
        actions={
          <Badge variant="secondary" className="h-fit">
            Foundation · M1
          </Badge>
        }
      />

      {!configured ? (
        <Card className="border-warning bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-amber-900">Supabase is not configured yet</p>
              <p className="mt-1 text-amber-800/80">
                Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
                <code className="rounded bg-amber-100 px-1">.env.local</code>, add your project
                URL and anon key, then restart <code className="rounded bg-amber-100 px-1">next dev</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">—</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button key={action} variant="outline" disabled title="Available in a later milestone">
              {action}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}