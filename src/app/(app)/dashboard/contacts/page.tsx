import Link from "next/link";
import { Download, Plus, Upload } from "lucide-react";
import { getMyOrg } from "@/lib/auth/org";
import { listContacts, listTags } from "@/lib/crm/queries";
import { CONTACT_TYPES } from "@/lib/crm/constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TagsManager } from "@/components/crm/tags-manager";
import { ContactsTable } from "./contacts-table";

interface SearchParams {
  q?: string | string[];
  type?: string | string[];
  tag?: string | string[];
  archived?: string | string[];
  page?: string | string[];
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getMyOrg();
  const params = await searchParams;
  const q = stringParam(params.q);
  const type = stringParam(params.type);
  const tag = stringParam(params.tag);
  const archived = stringParam(params.archived) === "1";
  const page = Number.parseInt(stringParam(params.page), 10) || 1;

  if (!ctx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace found</CardTitle>
          <CardDescription>
            Your account isn&apos;t linked to an organization yet. Ask your workspace owner to add
            you, then refresh this page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [result, tags] = await Promise.all([
    listContacts(ctx.org.id, {
      search: q,
      contactType: type,
      tagId: tag,
      includeArchived: archived,
      page,
    }),
    listTags(ctx.org.id),
  ]);

  const filters = new URLSearchParams();
  if (q) filters.set("q", q);
  if (type) filters.set("type", type);
  if (tag) filters.set("tag", tag);
  if (archived) filters.set("archived", "1");

  const pageUrl = (target: number) => {
    const p = new URLSearchParams(filters);
    if (target > 1) p.set("page", String(target));
    return `/dashboard/contacts?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contacts"
        description="People and businesses you work with."
        actions={
          <>
            <Link
              href="/dashboard/contacts/import"
              className={buttonVariants({ variant: "outline" })}
            >
              <Upload className="size-4" aria-hidden /> Import
            </Link>
            <Link href="/api/contacts/export" className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" aria-hidden /> Export
            </Link>
            <Link href="/dashboard/contacts/new" className={buttonVariants({})}>
              <Plus className="size-4" aria-hidden /> New contact
            </Link>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form
            method="GET"
            action="/dashboard/contacts"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="grid min-w-56 flex-1 gap-1.5">
              <Label htmlFor="q" className="text-xs">
                Search
              </Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Name, email, phone, company…"
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="type" className="text-xs">
                Type
              </Label>
              <Select id="type" name="type" defaultValue={type} className="h-9 w-44">
                <option value="">All types</option>
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tag" className="text-xs">
                Tag
              </Label>
              <Select id="tag" name="tag" defaultValue={tag} className="h-9 w-44">
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex h-9 items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="archived"
                value="1"
                defaultChecked={archived}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              Show archived
            </label>
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="outline" className="h-9">
                Apply
              </Button>
              <Link
                href="/dashboard/contacts"
                className={buttonVariants({ variant: "ghost", size: "sm" }) + " h-9"}
              >
                Clear
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      {result.contacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="font-medium">
              {q || type || tag ? "No contacts match your filters" : "No contacts yet"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {q || type || tag
                ? "Try broadening your search, or clear the filters."
                : "Add your first contact or import your existing list from a CSV."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ContactsTable contacts={result.contacts} />
          {result.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {result.total.toLocaleString()} contact{result.total === 1 ? "" : "s"}
                {tag ? " with the selected tag" : ""}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={pageUrl(page - 1)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Previous
                  </Link>
                ) : (
                  <span
                    className={buttonVariants({ variant: "outline", size: "sm" }) + " opacity-50"}
                    aria-disabled
                  >
                    Previous
                  </span>
                )}
                <span className="flex items-center px-1 text-sm text-muted-foreground">
                  {page} / {result.totalPages}
                </span>
                {page < result.totalPages ? (
                  <Link
                    href={pageUrl(page + 1)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Next
                  </Link>
                ) : (
                  <span
                    className={buttonVariants({ variant: "outline", size: "sm" }) + " opacity-50"}
                    aria-disabled
                  >
                    Next
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {/* Tags manager */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
          <CardDescription>Organize contacts by tag.</CardDescription>
        </CardHeader>
        <CardContent>
          <TagsManager tags={tags} canManage={ctx.role === "owner" || ctx.role === "admin"} />
        </CardContent>
      </Card>
    </div>
  );
}
