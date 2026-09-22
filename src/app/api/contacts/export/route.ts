import { NextResponse } from "next/server";
import { getMyOrg } from "@/lib/auth/org";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

/**
 * GET /api/contacts/export — downloads all non-archived contacts as CSV
 * (PRD §36 "CSV Export"). Server-side only; RLS still scopes rows to the
 * caller's organization.
 */
export async function GET() {
  const ctx = await getMyOrg();
  if (!ctx) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, phone, company, address, city, province, country, postal_code, contact_type, lead_status, source, notes, marketing_opt_in, created_at, updated_at",
    )
    .eq("organization_id", ctx.org.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20000);

  const { data: tagLinks } = await supabase
    .from("contact_tags")
    .select("contact_id, tag:tags(name)");
  const tagsByContact = new Map<string, string[]>();
  for (const link of tagLinks ?? []) {
    const key = String(link.contact_id);
    const name = (link.tag as { name?: string } | null)?.name;
    if (name) tagsByContact.set(key, [...(tagsByContact.get(key) ?? []), name]);
  }

  const headers = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company",
    "address",
    "city",
    "province",
    "country",
    "postal_code",
    "contact_type",
    "lead_status",
    "source",
    "tags",
    "notes",
    "marketing_opt_in",
    "created_at",
    "updated_at",
  ];

  const rows = (contacts ?? []).map((c) => [
    c.first_name ?? "",
    c.last_name ?? "",
    c.email ?? "",
    c.phone ?? "",
    c.company ?? "",
    c.address ?? "",
    c.city ?? "",
    c.province ?? "",
    c.country ?? "",
    c.postal_code ?? "",
    c.contact_type ?? "",
    c.lead_status ?? "",
    c.source ?? "",
    (tagsByContact.get(String(c.id)) ?? []).join("; "),
    c.notes ?? "",
    c.marketing_opt_in ? "yes" : "no",
    c.created_at ?? "",
    c.updated_at ?? "",
  ]);

  const csv = toCsv(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientleads-contacts-${date}.csv"`,
    },
  });
}
