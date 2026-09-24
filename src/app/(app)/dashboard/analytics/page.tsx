import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Contact2,
  Megaphone,
  Timer,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyOrg } from "@/lib/auth/org";
import { getAnalytics } from "@/lib/analytics/queries";
import type { AnalyticsFilters, AnalyticsMetrics } from "@/lib/analytics/queries";
import { localDateTimeToUtc } from "@/lib/timezone";

interface Metric {
  label: string;
  value: number | null;
  icon: typeof Users;
  hint?: string;
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
        <metric.icon className="size-4 text-muted-foreground/60" aria-hidden />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">
          {metric.value === null ? "—" : metric.value.toLocaleString()}
        </p>
        {metric.hint ? <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CampaignMetrics({ m, rangeLabel }: { m: AnalyticsMetrics; rangeLabel: string }) {
  const items: Metric[] = [
    {
      label: "Campaigns sent",
      value: m.campaignsSent,
      icon: Megaphone,
      hint: `sent in ${rangeLabel}`,
    },
    { label: "Recipients", value: m.campaignRecipients, icon: Users },
    { label: "Opened", value: m.campaignOpened, icon: TrendingUp, hint: "from sent campaigns" },
    { label: "Clicked", value: m.campaignClicked, icon: Timer, hint: "from sent campaigns" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4" aria-hidden /> Campaigns
        </CardTitle>
        <CardDescription>Email campaign delivery for the selected period.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <MetricCard key={item.label} metric={item} />
        ))}
      </CardContent>
    </Card>
  );
}

interface SearchParams {
  range?: string | string[];
  from?: string | string[];
  to?: string | string[];
  campaignStatus?: string | string[];
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function dateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateRange(
  range: string,
  fromInput: string,
  toInput: string,
  timeZone: string,
): AnalyticsFilters & { fromDate: string; toDate: string } {
  const today = dateInTimeZone(new Date(), timeZone);
  let fromDate = fromInput;
  let toDate = toInput || today;
  if (range !== "custom") {
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const start = new Date(Date.now() - (days - 1) * 86400_000);
    fromDate = dateInTimeZone(start, timeZone);
    toDate = today;
  }
  const from = localDateTimeToUtc(`${fromDate}T00:00`, timeZone)?.toISOString();
  const to = localDateTimeToUtc(`${toDate}T23:59`, timeZone)?.toISOString();
  return { from, to, fromDate, toDate };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getMyOrg();

  if (!ctx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <CardDescription>Your account isn&apos;t linked to an organization yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const params = await searchParams;
  const range = ["7d", "30d", "90d", "custom"].includes(first(params.range))
    ? first(params.range)
    : "30d";
  const campaignStatus = ["all", "Sent", "Scheduled", "Draft", "Cancelled"].includes(
    first(params.campaignStatus),
  )
    ? (first(params.campaignStatus) as AnalyticsFilters["campaignStatus"])
    : "all";
  const selectedRange = dateRange(range, first(params.from), first(params.to), ctx.org.timezone);
  const m = await getAnalytics(ctx.org.id, { ...selectedRange, campaignStatus });

  const primary: Metric[] = [
    { label: "Total contacts", value: m.totalContacts, icon: Users, hint: "not archived" },
    {
      label: `New contacts (${range === "custom" ? "selected period" : range})`,
      value: m.newContacts30d,
      icon: UserPlus,
      hint: "created during the selected period",
    },
    { label: "Open leads", value: m.openLeads, icon: Contact2, hint: "not Won or Lost" },
  ];
  const activity: Metric[] = [
    {
      label: "Upcoming appointments",
      value: m.upcomingAppointments,
      icon: CalendarClock,
      hint: "Scheduled / Confirmed from today",
    },
    {
      label: `Completed (${range === "custom" ? "selected period" : range})`,
      value: m.completedAppointments30d,
      icon: CalendarCheck,
      hint: "completed during the selected period",
    },
    {
      label: "Pending tasks",
      value: m.pendingTasks,
      icon: ClipboardList,
      hint: "Open / In Progress",
    },
    {
      label: "Overdue tasks",
      value: m.overdueTasks,
      icon: CheckCircle2,
      hint: "open tasks past their due date",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Analytics" description={`Key numbers for ${ctx.org.name}.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {primary.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {activity.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <CampaignMetrics
        m={m}
        rangeLabel={
          range === "custom" ? "the selected period" : `the last ${range.replace("d", " days")}`
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Campaign metrics use the sent date and your business timezone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 sm:grid-cols-4 sm:items-end">
            <label className="grid gap-2 text-sm font-medium">
              Period
              <select
                name="range"
                defaultValue={range}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              From
              <input
                name="from"
                type="date"
                defaultValue={selectedRange.fromDate}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              To
              <input
                name="to"
                type="date"
                defaultValue={selectedRange.toDate}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Campaign status
              <select
                name="campaignStatus"
                defaultValue={campaignStatus}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="Sent">Sent</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Draft">Draft</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
            <button
              type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground sm:col-span-4 sm:justify-self-start"
            >
              Apply filters
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
