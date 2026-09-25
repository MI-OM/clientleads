import { Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getMyOrg } from "@/lib/auth/org";
import { globalSearch } from "@/lib/search/queries";
import type { SearchHit, SearchHitType } from "@/lib/search/queries";

interface SearchParams {
  q?: string | string[];
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const SECTION_ORDER: SearchHitType[] = [
  "contact",
  "lead",
  "task",
  "appointment",
  "activity",
  "campaign",
];

const SECTION_LABELS: Record<SearchHitType, string> = {
  contact: "Contacts",
  lead: "Leads",
  task: "Tasks",
  appointment: "Appointments",
  activity: "Activity",
  campaign: "Campaigns",
};

function formatDate(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(new Date(iso));
  } catch {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleDateString();
    }
  }
}

function SearchResults({
  hits,
  query,
  timeZone,
}: {
  hits: SearchHit[];
  query: string;
  timeZone: string;
}) {
  if (hits.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No results</CardTitle>
          <CardDescription>
            Nothing matched “{query}” — try a name, email, or title.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const grouped = SECTION_ORDER.map((type) => ({
    type,
    hits: hits.filter((h) => h.type === type),
  })).filter((g) => g.hits.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {grouped.map((group) => (
        <Card key={group.type}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {SECTION_LABELS[group.type]}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {group.hits.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {group.hits.map((hit) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <Link
                    href={hit.href}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-3 hover:bg-accent/40 -mx-4 px-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="block truncate text-sm text-muted-foreground">
                          {hit.subtitle}
                        </span>
                      ) : null}
                    </span>
                    {hit.date ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(hit.date, timeZone)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getMyOrg();
  const params = await searchParams;
  const query = stringParam(params.q);

  const hits =
    ctx && query.trim().length >= 2 ? await globalSearch(ctx.org.id, query, ctx.org.timezone) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Search"
        description="One search box across contacts, leads, tasks and more."
      />

      <form action="/dashboard/search" method="GET" className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search your workspace…"
          className="max-w-xl"
          autoFocus
        />
        <Button type="submit">
          <Search className="size-4" aria-hidden /> Search
        </Button>
      </form>

      {query.trim().length < 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Search your workspace</CardTitle>
            <CardDescription>
              Type at least 2 characters to search contacts, leads, appointments, tasks, activity
              and campaigns.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : ctx ? (
        <SearchResults hits={hits} query={query} timeZone={ctx.org.timezone} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No workspace found</CardTitle>
            <CardDescription>
              Your account isn&apos;t linked to an organization yet.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
