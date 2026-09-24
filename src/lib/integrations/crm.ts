/**
 * M8 — CRM import runner: fetch (HubSpot) → normalize → dedupe → insert.
 *
 * Duplicate policy deliberately mirrors the CSV import
 * (src/lib/crm/actions.ts `importContactsCsvAction`): existing org
 * contacts are loaded once (email lowercased, phone digits-only) and the
 * Sets are never updated mid-import, so nothing is ever merged — duplicates
 * are counted and sampled for manual review (PRD §37).
 */
import { createClient } from "@/lib/supabase/server";
import type { Integration } from "./types";
import {
  fetchHubspotContacts,
  HubSpotError,
  hubspotErrorMessage,
  type HubSpotContactRecord,
} from "./hubspot";
import { setIntegrationStatus, touchIntegrationSync } from "./storage";

export interface CrmImportSummary {
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
  /** Up to 10 duplicate samples for manual review (name/email + reason). */
  samples: Array<{ value: string; reason: string }>;
}

/** Normalized row ready to insert into `contacts`. */
interface ContactInsertRow {
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  contact_type: "Contact";
  source: "CRM import";
}

function normalize(rec: HubSpotContactRecord): {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string | null;
} {
  const p = rec.properties ?? {};
  return {
    firstName: String(p.firstname ?? "").trim(),
    lastName: String(p.lastname ?? "").trim(),
    email: String(p.email ?? "").trim(),
    phone: String(p.phone ?? "").trim(),
    company: String(p.company ?? "").trim() || null,
  };
}

/**
 * Import all HubSpot contacts for a connection. Hard API failures mark the
 * integration "error" and rethrow a readable error; on success the
 * connection's last_synced_at is touched.
 */
export async function runHubspotCrmImport(
  orgId: string,
  connection: Integration,
): Promise<CrmImportSummary> {
  let records: HubSpotContactRecord[];
  try {
    records = await fetchHubspotContacts(connection.accessToken);
  } catch (err) {
    await setIntegrationStatus(orgId, "hubspot", connection.providerAccountId, "error").catch(
      () => undefined,
    );
    throw err instanceof HubSpotError ? err : new Error(hubspotErrorMessage(err));
  }

  const supabase = await createClient();

  // Existing normalized emails + phones for duplicate detection (never merge).
  const { data: existing } = await supabase
    .from("contacts")
    .select("email, phone")
    .eq("organization_id", orgId)
    .limit(50000);
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const c of existing ?? []) {
    const e = String(c.email ?? "")
      .trim()
      .toLowerCase();
    if (e) emails.add(e);
    const p = String(c.phone ?? "").replace(/\D/g, "");
    if (p) phones.add(p);
  }

  const summary: CrmImportSummary = {
    total: records.length,
    created: 0,
    duplicates: 0,
    skipped: 0,
    samples: [],
  };

  const rows: ContactInsertRow[] = [];

  for (const rec of records) {
    const { firstName, lastName, email, phone, company } = normalize(rec);

    // Fully-empty rows are skipped silently (mirrors the CSV import).
    if (!firstName && !lastName && !email && !phone) {
      summary.skipped++;
      continue;
    }

    // Duplicate detection: email (case-insensitive), then phone (digits).
    const em = email.toLowerCase();
    const ph = phone.replace(/\D/g, "");
    const dupReason = em && emails.has(em) ? "email" : ph && phones.has(ph) ? "phone" : null;
    if (dupReason) {
      summary.duplicates++;
      if (summary.samples.length < 10) {
        summary.samples.push({
          value: `${firstName} ${lastName}`.trim() || email,
          reason: `matches an existing contact by ${dupReason}`,
        });
      }
      continue;
    }

    rows.push({
      organization_id: orgId,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      company,
      contact_type: "Contact",
      source: "CRM import",
    });
  }

  // Insert in chunks and count from the rows Supabase returns.
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("contacts").insert(chunk).select("id");
    if (error) {
      summary.skipped += chunk.length;
      continue;
    }
    summary.created += (data ?? []).length;
  }

  await touchIntegrationSync(orgId, "hubspot", connection.providerAccountId);
  return summary;
}
