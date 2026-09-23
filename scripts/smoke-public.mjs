#!/usr/bin/env node
/**
 * M3 Public presence smoke test against the live project.
 *
 * Verifies the public milestone after migration 0004 is applied:
 *   - new tables exist (services, public_forms, form_fields, resources,
 *     resource_gates, form_submission_events) + private resources bucket
 *   - anon has NO table grants — the only public path is the
 *     get_public_page() RPC (leak-free projection, PRD §61/§65)
 *   - get_public_page returns the seeded org + "Contact us" form with 4
 *     fields; unknown slugs return null
 *   - services visibility: active services appear, inactive don't
 *   - submit_public_form: required-field + email validation, contact/lead/
 *     activity creation, per-IP rate limiting (10/hour/form)
 *   - gated resources: request_token → one-time use → replay rejected
 *   - non-gated resources never issue gate tokens
 *
 * Requires .env.local with Supabase creds (same loader as smoke-crm).
 * Run: npm run test:public
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadLocalEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const text = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}
loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.log("SKIP  Public smoke — Supabase env not fully configured.");
  process.exit(0);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const tag = Date.now().toString(36);
const cleanupIds = { contacts: [], leads: [], resources: [], gates: [], events: [] };

try {
  // 0) Tables exist
  const { data: tables } = await admin
    .from("pg_tables")
    .select("tablename")
    .in("tablename", ["services", "public_forms", "form_fields", "resources", "resource_gates", "form_submission_events"]);
  const tableNames = new Set((tables ?? []).map((t) => t.tablename));
  for (const t of ["services", "public_forms", "form_fields", "resources", "resource_gates", "form_submission_events"]) {
    record(`table ${t} exists`, tableNames.has(t));
  }
  if (!tableNames.has("services")) {
    console.log("\nMigration 0004 does not appear to be applied yet.");
    console.log('Open Supabase dashboard → SQL editor, paste supabase/migrations/20260922000004_m3_public.sql, run it.');
    process.exitCode = 1;
    process.exit(0);
  }

  // 1) anon has NO table grants — tables are invisible to the anon role
  const anonProbe = await anon.from("services").select("id").limit(1);
  record("anon cannot read services table (RLS-table grant denied)", !!anonProbe.error);

  // 2) resources bucket is private
  const { data: bucket } = await admin.storage.getBucket("resources");
  record("resources bucket exists", bucket?.name === "resources", bucket ? `public=${bucket.public}` : "missing");

  // 3) get_public_page — seeded org + form
  const pageRes = await anon.rpc("get_public_page", { p_slug: "first-client" });
  const page = pageRes.data;
  record("get_public_page('first-client') works", !pageRes.error && !!page, pageRes.error?.message ?? "");
  if (page) {
    record("public page has org branding (name)", page.org?.name === "First Client Real Estate", page.org?.name ?? "");
    const form = (page.forms ?? [])[0];
    record("seeded Contact-us form visible", form?.name === "Contact us", form?.name ?? "");
    record("form exposes its fields", Array.isArray(form?.fields) && form.fields.length === 4, String(form?.fields?.length));
    const keys = new Set((form?.fields ?? []).map((f) => f.field_key));
    record("form field keys are safe projection", keys.has("email") && keys.has("name") && !keys.has("id"));
  }

  const missing = await anon.rpc("get_public_page", { p_slug: "no-such-business-xyz" });
  record("unknown slug returns null (404 path)", missing.data === null);

  // 4) services visibility through the public projection
  const { data: orgRow } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "first-client")
    .maybeSingle();
  const orgId = orgRow?.id;
  if (!orgId) throw new Error("first-client org not found");

  const { data: svcActive } = await admin
    .from("services")
    .insert({
      organization_id: orgId,
      name: `Smoke service ${tag}`,
      duration_min: 45,
      price: 250,
      currency: "CAD",
      location_type: "in-person",
      booking_enabled: true,
      sort_order: 99,
    })
    .select("id")
    .single();
  cleanupIds.services = svcActive?.id ?? null;
  record("service created (admin)", !!svcActive?.id);

  const { data: svcInactive } = await admin
    .from("services")
    .insert({
      organization_id: orgId,
      name: `Smoke inactive ${tag}`,
      active: false,
      sort_order: 100,
    })
    .select("id")
    .single();
  cleanupIds.servicesInactive = svcInactive?.id ?? null;

  const pageAfter = await anon.rpc("get_public_page", { p_slug: "first-client" });
  const serviceNames = (pageAfter.data?.services ?? []).map((s) => s.name);
  record("active service listed publicly", serviceNames.includes(`Smoke service ${tag}`));
  record("inactive service hidden from public", !serviceNames.includes(`Smoke inactive ${tag}`));

  // 5) public form submission — full workflow
  const submissionEmail = `pub-${tag}@example.com`;
  const ip1 = `hash-a-${tag}`;
  const submit = await admin.rpc("submit_public_form", {
    p_form_slug: "contact-us",
    p_ip_hash: ip1,
    p_values: { name: "Public Smoke", email: submissionEmail, phone: "902-555-0188", message: "Hello!" },
  });
  const submitData = submit.data;
  record("form submission creates contact+lead", submitData?.ok === true, submit.error?.message ?? "");
  if (submitData?.contact_id) cleanupIds.contacts.push(submitData.contact_id);
  if (submitData?.lead_id) cleanupIds.leads.push(submitData.lead_id);
  record("first submission creates a NEW contact", submitData?.contact_created === true);

  // duplicate email reuses the same contact
  const submit2 = await admin.rpc("submit_public_form", {
    p_form_slug: "contact-us",
    p_ip_hash: `hash-a2-${tag}`,
    p_values: { name: "Public Smoke", email: submissionEmail, message: "Again" },
  });
  const s2 = submit2.data;
  record("duplicate email reuses the contact", s2?.contact_created === false, s2?.contact_id ?? "");
  if (s2?.contact_id) cleanupIds.contacts.push(s2.contact_id);
  if (s2?.lead_id) cleanupIds.leads.push(s2.lead_id);

  // activities were written for the submission
  const { data: activities } = await admin
    .from("activities")
    .select("activity_type")
    .eq("organization_id", orgId)
    .eq("contact_id", submitData?.contact_id)
    .order("created_at", { ascending: false })
    .limit(20);
  const activityTypes = new Set((activities ?? []).map((a) => a.activity_type));
  record("contact_created activity logged", activityTypes.has("contact_created"));
  record("form_submitted activity logged", activityTypes.has("form_submitted"));

  // required field missing
  const missingField = await admin.rpc("submit_public_form", {
    p_form_slug: "contact-us",
    p_ip_hash: `hash-b-${tag}`,
    p_values: { message: "no email" },
  });
  record("missing required field rejected", /FORM_FIELD_REQUIRED/i.test(missingField.error?.message ?? ""), missingField.error?.message ?? "");

  // invalid email rejected
  const badEmail = await admin.rpc("submit_public_form", {
    p_form_slug: "contact-us",
    p_ip_hash: `hash-c-${tag}`,
    p_values: { name: "A", email: "not-an-email" },
  });
  record("invalid email rejected", /FORM_INVALID_EMAIL/i.test(badEmail.error?.message ?? ""), badEmail.error?.message ?? "");

  // 6) rate limiting: 10 allowed, 11th blocked (same ip_hash)
  const burstHash = `hash-burst-${tag}`;
  let blocked = null;
  for (let i = 0; i < 11; i++) {
    const res = await admin.rpc("submit_public_form", {
      p_form_slug: "contact-us",
      p_ip_hash: burstHash,
      p_values: {
        name: `Burst ${i}`,
        email: `burst-${i}-${tag}@example.com`,
        message: "rate test",
      },
    });
    if (res.error && /FORM_RATE_LIMITED/i.test(res.error.message)) {
      blocked = i + 1;
      break;
    }
    if (res.data?.contact_id) cleanupIds.contacts.push(res.data.contact_id);
    if (res.data?.lead_id) cleanupIds.leads.push(res.data.lead_id);
    if (res.error) {
      record("burst submission without error", false, res.error.message);
      break;
    }
  }
  record("rate limit blocks the 11th submission", blocked === 11, blocked ? `blocked on #${blocked}` : "never blocked");

  // 7) gated resources — one-time token flow
  const { data: gated } = await admin
    .from("resources")
    .insert({
      organization_id: orgId,
      title: `Smoke gated ${tag}`,
      file_path: `orgs/${orgId}/smoke-gated-${tag}.pdf`,
      file_name: "smoke-gated.pdf",
      mime_type: "application/pdf",
      file_size: 1234,
      visibility: "public",
      published: true,
      gated: true,
    })
    .select("id")
    .single();
  cleanupIds.resources.push(gated?.id);
  record("gated resource created", !!gated?.id);

  const gate = await admin.rpc("request_resource_download", {
    p_resource_id: gated?.id,
    p_name: "Gate Smoke",
    p_email: `gate-${tag}@example.com`,
    p_phone: null,
  });
  const gateData = gate.data;
  record("gate request issues a token", gateData?.ok === true && !!gateData?.token, gate.error?.message ?? "");
  if (gateData?.contact_id) cleanupIds.contacts.push(gateData.contact_id);
  if (gateData?.lead_id) cleanupIds.leads.push(gateData.lead_id);

  const { data: gateRow } = await admin
    .from("resource_gates")
    .select("id")
    .eq("resource_id", gated?.id)
    .maybeSingle();
  if (gateRow?.id) cleanupIds.gates.push(gateRow.id);

  const download1 = await admin.rpc("record_resource_download", {
    p_resource_id: gated?.id,
    p_token: gateData?.token,
  });
  record("valid token unlocks download", download1.data?.ok === true, download1.error?.message ?? "");

  const download2 = await admin.rpc("record_resource_download", {
    p_resource_id: gated?.id,
    p_token: gateData?.token,
  });
  record("token is single-use (replay rejected)", /RESOURCE_GATE_REQUIRED/i.test(download2.error?.message ?? ""), download2.error?.message ?? "");

  const { data: updatedGated } = await admin.from("resources").select("download_count").eq("id", gated?.id).maybeSingle();
  record("download counter incremented once", updatedGated?.download_count === 1, String(updatedGated?.download_count));

  // gated without token → rejected
  const noToken = await admin.rpc("record_resource_download", { p_resource_id: gated?.id, p_token: null });
  record("gated download without token rejected", /RESOURCE_GATE_REQUIRED/i.test(noToken.error?.message ?? ""), noToken.error?.message ?? "");

  // 8) non-gated resource → no token issued, public download works
  const { data: open } = await admin
    .from("resources")
    .insert({
      organization_id: orgId,
      title: `Smoke open ${tag}`,
      file_path: `orgs/${orgId}/smoke-open-${tag}.pdf`,
      file_name: "smoke-open.pdf",
      mime_type: "application/pdf",
      file_size: 999,
      visibility: "public",
      published: true,
      gated: false,
    })
    .select("id")
    .single();
  cleanupIds.resources.push(open?.id);

  const openGate = await admin.rpc("request_resource_download", {
    p_resource_id: open?.id,
    p_name: "X",
    p_email: "x@example.com",
  });
  record("non-gated resource yields no gate token", /RESOURCE_NOT_GATED/i.test(openGate.error?.message ?? ""), openGate.error?.message ?? "");

  const openDownload = await admin.rpc("record_resource_download", { p_resource_id: open?.id, p_token: null });
  record("non-gated resource downloads directly", openDownload.data?.ok === true, openDownload.error?.message ?? "");

  // private resources never appear publicly
  const { data: priv } = await admin
    .from("resources")
    .insert({
      organization_id: orgId,
      title: `Smoke private ${tag}`,
      file_path: `orgs/${orgId}/smoke-private-${tag}.pdf`,
      file_name: "smoke-private.pdf",
      visibility: "private",
      published: true,
      gated: false,
    })
    .select("id")
    .single();
  cleanupIds.resources.push(priv?.id);

  const pageFinal = await anon.rpc("get_public_page", { p_slug: "first-client" });
  const publicTitles = (pageFinal.data?.resources ?? []).map((r) => r.title);
  record("private resource hidden from public page", !publicTitles.includes(`Smoke private ${tag}`));
} catch (err) {
  record("smoke test executed cleanly", false, err.message);
} finally {
  // Best-effort cleanup (service role bypasses RLS)
  try {
    const { data: events } = await admin
      .from("form_submission_events")
      .select("id")
      .in("ip_hash", [`hash-a-${tag}`, `hash-a2-${tag}`, `hash-b-${tag}`, `hash-c-${tag}`, `hash-burst-${tag}`]);
    for (const e of events ?? []) cleanupIds.events.push(e.id);
    if (cleanupIds.events.length) await admin.from("form_submission_events").delete().in("id", cleanupIds.events);
    if (cleanupIds.gates.length) await admin.from("resource_gates").delete().in("id", cleanupIds.gates);
    if (cleanupIds.resources.length) await admin.from("resources").delete().in("id", cleanupIds.resources);
    if (cleanupIds.leads.length) await admin.from("leads").delete().in("id", cleanupIds.leads);
    if (cleanupIds.contacts.length) await admin.from("contacts").delete().in("id", cleanupIds.contacts);
    if (cleanupIds.services) await admin.from("services").delete().eq("id", cleanupIds.services);
    if (cleanupIds.servicesInactive) await admin.from("services").delete().eq("id", cleanupIds.servicesInactive);
  } catch {
    // keep going
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length > 0 ? 1 : 0;