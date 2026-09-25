import { createClient } from "@/lib/supabase/server";
import { formatWhen, formatDateInZone } from "@/lib/timezone";

/**
 * M6 global search (PRD §35): one query box across contacts, leads,
 * appointments, tasks and activities. Org-scoping is enforced by RLS on
 * every read. Campaigns are OPTIONAL/guarded like analytics — the tables
 * belong to M5 and the section is skipped while they don't resolve.
 *
 * Returns flat, deduped hits sorted by a coarse type priority then recency.
 */

export type SearchHitType = "contact" | "lead" | "appointment" | "task" | "activity" | "campaign";

export interface SearchHit {
  id: string;
  type: SearchHitType;
  title: string;
  subtitle: string;
  href: string;
  date: string | null;
}

const TYPE_PRIORITY: Record<SearchHitType, number> = {
  contact: 0,
  lead: 1,
  task: 2,
  appointment: 3,
  activity: 4,
  campaign: 5,
};

interface LeadRow {
  id: string;
  stage: string;
  created_at: string;
  updated_at: string;
  contact: { first_name?: string; last_name?: string; email?: string | null } | null;
}

export async function globalSearch(
  orgId: string,
  rawQuery: string,
  timeZone = "America/St_Johns",
): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const pattern = `%${q}%`;
  const supabase = await createClient();

  const [contacts, leads, appointments, tasks, activities] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, company, created_at")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company.ilike.${pattern}`,
      )
      .order("updated_at", { ascending: false })
      .limit(25),
    supabase
      .from("leads")
      .select("id, stage, created_at, updated_at, contact:contacts(first_name, last_name, email)")
      .eq("organization_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("appointments")
      .select("id, customer_name, customer_email, status, starts_at")
      .eq("organization_id", orgId)
      .or(`customer_name.ilike.${pattern},customer_email.ilike.${pattern}`)
      .order("starts_at", { ascending: false })
      .limit(25),
    supabase
      .from("tasks")
      .select("id, title, description, status, due_date, created_at")
      .eq("organization_id", orgId)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(25),
    supabase
      .from("activities")
      .select("id, activity_type, subject, description, created_at")
      .eq("organization_id", orgId)
      .or(`subject.ilike.${pattern},description.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const hits: SearchHit[] = [];

  for (const c of contacts.data ?? []) {
    const name =
      `${String(c.first_name ?? "")} ${String(c.last_name ?? "")}`.trim() || "Unnamed contact";
    hits.push({
      id: String(c.id),
      type: "contact",
      title: name,
      subtitle: [c.email, c.phone, c.company].filter(Boolean).join(" · ") || "Contact",
      href: `/dashboard/contacts/${String(c.id)}`,
      date: String(c.created_at ?? ""),
    });
  }

  const qLower = q.toLowerCase();
  for (const l of (leads.data ?? []) as LeadRow[]) {
    const contactName = l.contact
      ? `${String(l.contact.first_name ?? "")} ${String(l.contact.last_name ?? "")}`.trim()
      : "";
    const hay = `${contactName} ${l.contact?.email ?? ""} ${l.stage}`.toLowerCase();
    if (!hay.includes(qLower)) continue;
    hits.push({
      id: l.id,
      type: "lead",
      title: contactName || "Unnamed lead",
      subtitle: `Lead · ${l.stage}`,
      href: `/dashboard/leads/${l.id}`,
      date: l.updated_at,
    });
  }

  for (const a of appointments.data ?? []) {
    hits.push({
      id: String(a.id),
      type: "appointment",
      title: `${String(a.customer_name ?? "")} · ${String(a.status ?? "")}`,
      subtitle: [a.customer_email, a.starts_at ? formatWhen(a.starts_at, timeZone) : ""]
        .filter(Boolean)
        .join(" · "),
      href: "/dashboard/appointments",
      date: String(a.starts_at ?? ""),
    });
  }

  for (const t of tasks.data ?? []) {
    hits.push({
      id: String(t.id),
      type: "task",
      title: String(t.title),
      subtitle: [
        String(t.status ?? ""),
        t.due_date ? `Due ${formatDateInZone(t.due_date, timeZone)}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/dashboard/tasks/${String(t.id)}/edit`,
      date: String(t.due_date ?? t.created_at ?? ""),
    });
  }

  for (const ac of activities.data ?? []) {
    hits.push({
      id: String(ac.id),
      type: "activity",
      title: String(ac.subject ?? String(ac.activity_type ?? "Activity")),
      subtitle: String(ac.description ?? String(ac.activity_type ?? "")),
      href: "/dashboard/activities",
      date: String(ac.created_at ?? ""),
    });
  }

  // Campaigns — guarded (M5 tables may not exist yet); skip silently.
  try {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name, subject, status")
      .eq("organization_id", orgId)
      .or(`name.ilike.${pattern},subject.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(10);
    for (const c of campaigns ?? []) {
      hits.push({
        id: String(c.id),
        type: "campaign",
        title: String(c.name ?? "Campaign"),
        subtitle: [String(c.subject ?? ""), String(c.status ?? "")].filter(Boolean).join(" · "),
        href: "/dashboard/campaigns",
        date: null,
      });
    }
  } catch {
    // M5 not applied yet — campaigns just don't appear.
  }

  return hits.sort(
    (a, b) =>
      TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] ||
      String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
}
