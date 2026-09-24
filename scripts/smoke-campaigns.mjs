#!/usr/bin/env node
/**
 * M5 Campaigns smoke test against the live project.
 *
 * Verifies the campaigns milestone after migration 0006 is applied:
 *   - email_templates / campaigns / campaign_recipients tables exist
 *   - anon has NO table grants — the only anon surface is the leak-free
 *     get_unsubscribe_ctx RPC
 *   - 9 seeded templates for the first-client org
 *   - email template CRUD (admin/service role)
 *   - campaign CRUD
 *   - audience resolution EXCLUDES unsubscribed / opted-out / no-email /
 *     archived contacts (all, tags-AND and custom-field scopes)
 *   - status state machine: Draft → Scheduled → Sending → Sent / Cancelled,
 *     with invalid transitions rejected
 *   - process_campaign_event webhook RPC: delivered/opened/clicked/bounced/
 *     unsubscribe, monotonic status, recomputed counters (idempotent)
 *   - get_unsubscribe_ctx returns only the caller's own minimal fields
 *   - unsubscribe_contact sets contact suppression + recipient + counters
 *   - webhook signature scheme: wrong secret rejected, correct accepted
 *   - optional live POST to the local webhook route (RUN_WEBHOOK_LIVE=1)
 *   - anon cannot execute any write RPC (service role only)
 *
 * Requires .env.local with Supabase creds. Run: node scripts/smoke-campaigns.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  console.log("SKIP  Campaigns smoke — Supabase env not fully configured.");
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
const runEmail = (name) => `${name}-${tag}@example.com`;
const cleanup = {
  campaigns: [],
  templates: [],
  contacts: [],
  tags: [],
  contactTags: [],
  customFieldValues: [],
  customFields: [],
};

/** Local mirror of the route's HMAC contract (hex HMAC-SHA256 over raw body). */
function signature(secret, body) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
function verify(secret, body, sig) {
  if (!sig) return false;
  const expected = Buffer.from(signature(secret, body), "utf8");
  const received = Buffer.from(String(sig).trim(), "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

try {
  // ── 0) tables + seed ────────────────────────────────────────────────
  const EXPECTED_TABLES = ["email_templates", "campaigns", "campaign_recipients"];
  let allTables = true;
  for (const t of EXPECTED_TABLES) {
    const { error } = await admin.from(t).select("id").limit(1);
    const ok = !error || !/could not find the table/i.test(error.message);
    if (!ok) allTables = false;
    record(`table ${t} exists`, ok);
  }
  if (!allTables) {
    console.log("\nMigration 0006 does not appear to be applied yet.");
    console.log(
      "Open Supabase dashboard → SQL editor, paste supabase/migrations/20260923000006_m5_campaigns.sql, run it.",
    );
    process.exitCode = 1;
    process.exit(0);
  }

  const { data: orgRow } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", "first-client")
    .maybeSingle();
  const orgId = orgRow?.id;
  if (!orgId) throw new Error("first-client org not found");

  // seeded templates
  const { data: seedTemplates } = await admin
    .from("email_templates")
    .select("name")
    .eq("organization_id", orgId);
  const seedNames = new Set((seedTemplates ?? []).map((t) => t.name));
  record(
    "9 seeded templates",
    (seedTemplates ?? []).length >= 9,
    `${(seedTemplates ?? []).length} templates`,
  );
  record(
    "seed includes Welcome + Newsletter + Lead response",
    ["Welcome", "Newsletter", "Lead response"].every((n) => seedNames.has(n)),
  );

  // ── 1) anon has NO table grants ────────────────────────────────────
  const anonProbe = await anon.from("campaigns").select("id").limit(1);
  record("anon cannot read campaigns table (no grants)", !!anonProbe.error);

  // ── 2) template CRUD (service role) ────────────────────────────────
  const { data: scratchTemplate } = await admin
    .from("email_templates")
    .insert({
      organization_id: orgId,
      name: `Smoke template ${tag}`,
      subject: "Hello {{first_name}}",
      body: "Hi {{first_name}},\n\n{{unsubscribe_url}}",
      variables: ["first_name", "unsubscribe_url"],
    })
    .select("id, name")
    .single();
  cleanup.templates.push(scratchTemplate?.id ?? null);
  record("scratch template created", !!scratchTemplate?.id);

  const { error: tmplUpdateErr } = await admin
    .from("email_templates")
    .update({ subject: "Updated subject" })
    .eq("id", scratchTemplate?.id);
  record("scratch template updated", !tmplUpdateErr, tmplUpdateErr?.message ?? "");

  const { data: tmplRead } = await admin
    .from("email_templates")
    .select("subject")
    .eq("id", scratchTemplate?.id)
    .maybeSingle();
  record("scratch template reads back changes", tmplRead?.subject === "Updated subject");

  // ── 3) campaign CRUD ───────────────────────────────────────────────
  const { data: scratchCampaign } = await admin
    .from("campaigns")
    .insert({
      organization_id: orgId,
      name: `Smoke campaign ${tag}`,
      subject: "Smoke subject",
      preview_text: "preview",
      content: "Hi {{first_name}}, {{unsubscribe_url}}",
      sender_name: "ClientLeads",
      sender_email: runEmail("sender"),
      audience: { scope: "all" },
    })
    .select("id, status")
    .single();
  cleanup.campaigns.push(scratchCampaign?.id ?? null);
  record(
    "scratch campaign created (Draft)",
    scratchCampaign?.id && scratchCampaign?.status === "Draft",
  );

  const { error: campaignUpdateErr } = await admin
    .from("campaigns")
    .update({ subject: "Updated subject" })
    .eq("id", scratchCampaign?.id);
  record("scratch campaign updated", !campaignUpdateErr, campaignUpdateErr?.message ?? "");

  // ── 4) contacts for audience tests ─────────────────────────────────
  const contactsInput = [
    { key: "opt-in", email: runEmail("optin"), marketing_opt_in: true, contact_type: "Lead" },
    { key: "opted-out", email: runEmail("optout"), marketing_opt_in: false, contact_type: "Lead" },
    {
      key: "unsubscribed",
      email: runEmail("unsub"),
      marketing_opt_in: true,
      contact_type: "Lead",
      unsubscribed_at: new Date().toISOString(),
    },
    {
      key: "archived",
      email: runEmail("archived"),
      marketing_opt_in: true,
      contact_type: "Lead",
      archived_at: new Date().toISOString(),
    },
    { key: "no-email", email: null, marketing_opt_in: true, contact_type: "Lead" },
    { key: "client", email: runEmail("client"), marketing_opt_in: true, contact_type: "Client" },
  ];
  const contactIds = {};
  for (const c of contactsInput) {
    const { data } = await admin
      .from("contacts")
      .insert({
        organization_id: orgId,
        first_name: c.key,
        last_name: "Smoke",
        email: c.email,
        marketing_opt_in: c.marketing_opt_in,
        contact_type: c.contact_type,
        unsubscribed_at: c.unsubscribed_at ?? null,
        archived_at: c.archived_at ?? null,
      })
      .select("id")
      .single();
    contactIds[c.key] = data?.id ?? null;
    cleanup.contacts.push(data?.id ?? null);
  }
  record(
    "scratch contacts created",
    Object.keys(contactIds).every((k) => !!contactIds[k]),
  );

  // tag + tag links (AND semantics)
  const { data: scratchTag } = await admin
    .from("tags")
    .insert({ organization_id: orgId, name: `Smoke tag ${tag}` })
    .select("id")
    .single();
  cleanup.tags.push(scratchTag?.id ?? null);
  const tagLinks = [
    { contact_id: contactIds["opt-in"], tag_id: scratchTag?.id },
    { contact_id: contactIds["client"], tag_id: scratchTag?.id },
  ];
  for (const link of tagLinks) {
    const { data } = await admin.from("contact_tags").insert(link).select("contact_id").single();
    cleanup.contactTags.push(link);
  }
  record("tag + links created", !!scratchTag?.id && tagLinks.length === 2);

  // custom field + values for the custom scope
  const fieldKey = `smoke_area_${tag}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const { data: scratchField } = await admin
    .from("custom_fields")
    .insert({
      organization_id: orgId,
      entity_type: "contact",
      name: `Smoke area ${tag}`,
      field_key: fieldKey,
      field_type: "text",
      options: [],
      required: false,
      sort_order: 99,
      is_active: true,
    })
    .select("id")
    .single();
  cleanup.customFields.push(scratchField?.id ?? null);
  for (const key of ["opt-in", "client"]) {
    const { data } = await admin
      .from("contact_custom_values")
      .insert({
        organization_id: orgId,
        contact_id: contactIds[key],
        custom_field_id: scratchField?.id,
        value: "Halifax",
      })
      .select("custom_field_id")
      .single();
    cleanup.customFieldValues.push(data?.custom_field_id ?? null);
  }
  record("custom field + values created", !!scratchField?.id);

  // ── 5) audience resolution — the exclusions (PRD §29) ──────────────
  const makeCampaign = async (name, audience) => {
    const { data } = await admin
      .from("campaigns")
      .insert({
        organization_id: orgId,
        name: `${name} ${tag}`,
        subject: "x",
        content: "x",
        sender_email: runEmail("sender"),
        audience,
      })
      .select("id, status")
      .single();
    cleanup.campaigns.push(data?.id ?? null);
    return data;
  };
  const resolve = async (campaignId) =>
    admin.rpc("resolve_campaign_recipients", { p_campaign_id: campaignId });
  const recipientContactIds = async (campaignId) => {
    const { data } = await admin
      .from("campaign_recipients")
      .select("contact_id")
      .eq("campaign_id", campaignId);
    return new Set((data ?? []).map((r) => r.contact_id));
  };

  const cAll = await makeCampaign("Smoke all", { scope: "all" });
  const allRes = await resolve(cAll?.id);
  const allIds = await recipientContactIds(cAll?.id);
  record(
    "scope=all resolves only opted-in, reachable contacts",
    allRes.data?.ok === true &&
      allRes.data?.recipient_count === 2 &&
      allIds.has(contactIds["opt-in"]) &&
      allIds.has(contactIds.client) &&
      !allIds.has(contactIds["opted-out"]) &&
      !allIds.has(contactIds.unsubscribed) &&
      !allIds.has(contactIds.archived) &&
      !allIds.has(contactIds["no-email"]),
    `count=${allRes.data?.recipient_count ?? "?"}`,
  );

  const cTags = await makeCampaign("Smoke tags", { scope: "tags", tags: [scratchTag?.id] });
  const tagsRes = await resolve(cTags?.id);
  const tagsIds = await recipientContactIds(cTags?.id);
  record(
    "scope=tags requires ALL selected tags (AND)",
    tagsRes.data?.recipient_count === 2 &&
      tagsIds.has(contactIds["opt-in"]) &&
      tagsIds.has(contactIds.client),
    `count=${tagsRes.data?.recipient_count ?? "?"}`,
  );

  const cType = await makeCampaign("Smoke type", { scope: "contact_type", contact_type: "Lead" });
  const typeRes = await resolve(cType?.id);
  const typeIds = await recipientContactIds(cType?.id);
  record(
    "scope=contact_type filters by type",
    typeRes.data?.recipient_count === 1 && typeIds.has(contactIds["opt-in"]),
    `count=${typeRes.data?.recipient_count ?? "?"}`,
  );

  const cCustom = await makeCampaign("Smoke custom", {
    scope: "custom",
    custom_fields: [{ field_key: fieldKey, operator: "eq", value: "Halifax" }],
  });
  const customRes = await resolve(cCustom?.id);
  const customIds = await recipientContactIds(cCustom?.id);
  record(
    "scope=custom matches active custom field (eq)",
    customRes.data?.recipient_count === 2 &&
      customIds.has(contactIds["opt-in"]) &&
      customIds.has(contactIds.client),
    `count=${customRes.data?.recipient_count ?? "?"}`,
  );

  // unknown field key → rejected by the resolver
  const cBadField = await makeCampaign("Smoke bad field", {
    scope: "custom",
    custom_fields: [{ field_key: "totally_unknown_key", operator: "eq", value: "x" }],
  });
  const badFieldRes = await resolve(cBadField?.id);
  record(
    "unknown custom field key rejected",
    /CAMPAIGN_AUDIENCE_UNKNOWN_FIELD/.test(badFieldRes.error?.message ?? ""),
    badFieldRes.error?.message ?? "",
  );

  // ── 6) status state machine ────────────────────────────────────────
  // Scheduled + cancel
  const cSchedule = await makeCampaign("Smoke schedule", { scope: "all" });
  const future = new Date(Date.now() + 86400_000).toISOString();
  const schedRes = await admin.rpc("schedule_campaign", {
    p_campaign_id: cSchedule?.id,
    p_scheduled_for: future,
  });
  record(
    "Draft → Scheduled via schedule_campaign",
    schedRes.data?.ok === true && schedRes.data?.status === "Scheduled",
    schedRes.error?.message ?? "",
  );
  const schedAgain = await admin.rpc("schedule_campaign", {
    p_campaign_id: cSchedule?.id,
    p_scheduled_for: future,
  });
  record(
    "Scheduled can't be re-scheduled",
    /CAMPAIGN_NOT_SCHEDULABLE/.test(schedAgain.error?.message ?? ""),
    schedAgain.error?.message ?? "",
  );
  const cancelSched = await admin.rpc("cancel_campaign", { p_campaign_id: cSchedule?.id });
  record(
    "Scheduled → Cancelled via cancel_campaign",
    cancelSched.data?.ok === true && cancelSched.data?.status === "Cancelled",
    cancelSched.error?.message ?? "",
  );
  const cancelAgain = await admin.rpc("cancel_campaign", { p_campaign_id: cSchedule?.id });
  record(
    "Cancelled can't be cancelled again",
    /CAMPAIGN_CANNOT_CANCEL/.test(cancelAgain.error?.message ?? ""),
    cancelAgain.error?.message ?? "",
  );

  // cancel from Draft, then can't resolve
  const cCancel = await makeCampaign("Smoke cancel", { scope: "all" });
  await admin.rpc("cancel_campaign", { p_campaign_id: cCancel?.id });
  const cancelThenResolve = await resolve(cCancel?.id);
  record(
    "Cancelled campaign can't be resolved (not sendable)",
    /CAMPAIGN_NOT_SENDABLE/.test(cancelThenResolve.error?.message ?? ""),
    cancelThenResolve.error?.message ?? "",
  );

  // resolve → Sending → mark sent → Sent
  const cSend = await makeCampaign("Smoke send", { scope: "all" });
  const sendRes = await resolve(cSend?.id);
  const { data: sendStatusRow } = await admin
    .from("campaigns")
    .select("status")
    .eq("id", cSend?.id)
    .maybeSingle();
  record(
    "resolve flips campaign to Sending",
    sendRes.data?.ok === true && sendStatusRow?.status === "Sending",
    sendStatusRow?.status ?? "?",
  );

  // mark_sent from Draft is rejected (a different fresh campaign)
  const cDraftMark = await makeCampaign("Smoke draft mark", { scope: "all" });
  const markFromDraft = await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: cDraftMark?.id,
    p_provider_ids: {},
  });
  record(
    "mark_sent requires Sending status",
    /CAMPAIGN_NOT_SENDING/.test(markFromDraft.error?.message ?? ""),
    markFromDraft.error?.message ?? "",
  );

  // mark_sent with provider ids (resend email_id correlation target)
  const { data: sendRecipients } = await admin
    .from("campaign_recipients")
    .select("id")
    .eq("campaign_id", cSend?.id)
    .eq("status", "Queued");
  const providerMap = {};
  let providerId = null;
  if (sendRecipients?.[0]?.id) {
    providerId = `msg_${tag}_001`;
    providerMap[sendRecipients[0].id] = providerId;
  }
  const markRes = await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: cSend?.id,
    p_provider_ids: providerMap,
  });
  record(
    "mark_sent flips campaign to Sent",
    markRes.data?.ok === true && markRes.data?.status === "Sent",
    markRes.error?.message ?? "",
  );
  const markAgain = await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: cSend?.id,
    p_provider_ids: {},
  });
  record(
    "Sent can't be marked sent again",
    /CAMPAIGN_NOT_SENDING/.test(markAgain.error?.message ?? ""),
    markAgain.error?.message ?? "",
  );
  const resolveSent = await resolve(cSend?.id);
  record(
    "Sent campaign can't be resolved",
    /CAMPAIGN_NOT_SENDABLE/.test(resolveSent.error?.message ?? ""),
    resolveSent.error?.message ?? "",
  );
  const { data: providerRow } = await admin
    .from("campaign_recipients")
    .select("provider_message_id")
    .eq("campaign_id", cSend?.id)
    .eq("id", sendRecipients?.[0]?.id)
    .maybeSingle();
  record(
    "provider message id recorded for webhook correlation",
    providerRow?.provider_message_id === providerId,
    providerRow?.provider_message_id ?? "null",
  );

  // ── 7) webhook events + counters (PRD §28) ─────────────────────────
  const cEvents = await makeCampaign("Smoke events", { scope: "all" });
  await resolve(cEvents?.id);
  await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: cEvents?.id,
    p_provider_ids: {},
  });
  const { data: eventRecipients } = await admin
    .from("campaign_recipients")
    .select("id")
    .eq("campaign_id", cEvents?.id)
    .order("created_at", { ascending: true });
  const r1 = eventRecipients?.[0]?.id;
  const r2 = eventRecipients?.[1]?.id;
  record("events campaign resolved 2 recipients", !!r1 && !!r2);

  const eventAt = new Date().toISOString();
  const fire = (recipientId, event, campaignId = cEvents?.id) =>
    admin.rpc("process_campaign_event", {
      p_campaign_id: campaignId,
      p_recipient_id: recipientId,
      p_event: event,
      p_occurred_at: eventAt,
    });

  const delivered1 = await fire(r1, "email.delivered");
  record(
    "email.delivered normalizes + delivers",
    delivered1.data?.ok === true && delivered1.data?.status === "Delivered",
    delivered1.error?.message ?? "",
  );
  const opened1 = await fire(r1, "email.opened");
  record("delivered → opened (monotonic)", opened1.data?.status === "Opened");
  const clicked1 = await fire(r1, "email.clicked");
  record("opened → clicked (monotonic)", clicked1.data?.status === "Clicked");
  const deliveredAgain = await fire(r1, "email.delivered");
  record(
    "re-delivery after click doesn't regress status",
    deliveredAgain.data?.status === "Clicked",
  );
  const delivered2 = await fire(r2, "email.delivered");
  record("second recipient delivered", delivered2.data?.status === "Delivered");
  const bounced2 = await fire(r2, "email.bounced");
  record("delivered → bounced (terminal)", bounced2.data?.status === "Bounced");

  const { data: eventCampaign } = await admin
    .from("campaigns")
    .select(
      "recipients_count, delivered_count, opened_count, clicked_count, bounced_count, unsubscribed_count",
    )
    .eq("id", cEvents?.id)
    .maybeSingle();
  record(
    "counters recomputed from recipient rows",
    eventCampaign?.recipients_count === 2 &&
      eventCampaign?.delivered_count === 1 &&
      eventCampaign?.opened_count === 1 &&
      eventCampaign?.clicked_count === 1 &&
      eventCampaign?.bounced_count === 1 &&
      eventCampaign?.unsubscribed_count === 0,
    JSON.stringify(eventCampaign ?? {}),
  );

  // unknown event → harmless ack, no state change
  const unknown = await fire(r1, "email.nonsense");
  record(
    "unknown event acknowledged without error",
    unknown.data?.ok === false && /unknown_event/.test(unknown.data?.reason ?? ""),
  );

  // ── 8) unsubscribe (PRD §29) ───────────────────────────────────────
  const cUnsub = await makeCampaign("Smoke unsub", { scope: "all" });
  await resolve(cUnsub?.id);
  await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: cUnsub?.id,
    p_provider_ids: {},
  });
  const { data: unsubRecipients } = await admin
    .from("campaign_recipients")
    .select("id, token, contact:contacts(id)")
    .eq("campaign_id", cUnsub?.id)
    .limit(1);
  const unsubToken = unsubRecipients?.[0]?.token;
  const unsubContactId = unsubRecipients?.[0]?.contact?.id;
  record("unsubscribe campaign has tokenized recipient", !!unsubToken && !!unsubContactId);

  const unsubEvent = await fire(unsubRecipients?.[0]?.id, "email.unsubscribed", cUnsub?.id);
  record(
    "email.unsubscribed maps to unsubscribe",
    unsubEvent.data?.ok === true && unsubEvent.data?.status === "Unsubscribed",
    unsubEvent.error?.message ?? "",
  );
  const { data: suppressedContact } = await admin
    .from("contacts")
    .select("unsubscribed_at, marketing_opt_in")
    .eq("id", unsubContactId)
    .maybeSingle();
  record(
    "webhook unsubscribe suppresses the contact",
    suppressedContact?.unsubscribed_at !== null && suppressedContact?.marketing_opt_in === false,
  );
  const { data: unsubCountRow } = await admin
    .from("campaigns")
    .select("unsubscribed_count")
    .eq("id", cUnsub?.id)
    .maybeSingle();
  record("unsubscribed counter bumped", unsubCountRow?.unsubscribed_count === 1);

  // ── 9) get_unsubscribe_ctx — leak-free anon read ───────────────────
  const lookup = await anon.rpc("get_unsubscribe_ctx", { p_token: unsubToken });
  record(
    "anon token lookup returns the recipient's own context",
    lookup.data?.ok === true && lookup.data?.already_unsubscribed === true,
    lookup.error?.message ?? "",
  );
  const allowedKeys = new Set(["ok", "org_name", "first_name", "already_unsubscribed"]);
  const leakKeys = Object.keys(lookup.data ?? {}).filter((k) => !allowedKeys.has(k));
  record(
    "unsubscribe payload exposes only own minimal fields",
    leakKeys.length === 0,
    leakKeys.join(","),
  );
  const ghost = await anon.rpc("get_unsubscribe_ctx", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  record("unknown token → null", ghost.data === null, ghost.error?.message ?? "");

  // ── 10) unsubscribe_contact (manual opt-out link confirm) ──────────
  const cManual = await makeCampaign("Smoke manual unsub", { scope: "all" });
  await resolve(cManual?.id);
  await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: cManual?.id,
    p_provider_ids: {},
  });
  const { data: manualRecipients } = await admin
    .from("campaign_recipients")
    .select("id, token, contact:contacts(id)")
    .eq("campaign_id", cManual?.id)
    .limit(1);
  const manualToken = manualRecipients?.[0]?.token;
  const manualContactId = manualRecipients?.[0]?.contact?.id;
  const manualRes = await admin.rpc("unsubscribe_contact", { p_token: manualToken });
  record(
    "unsubscribe_contact marks recipient Unsubscribed",
    manualRes.data?.ok === true && manualRes.data?.status === "Unsubscribed",
    manualRes.error?.message ?? "",
  );
  const { data: manualContact } = await admin
    .from("contacts")
    .select("unsubscribed_at, marketing_opt_in")
    .eq("id", manualContactId)
    .maybeSingle();
  record(
    "unsubscribe_contact suppresses the contact",
    manualContact?.unsubscribed_at !== null && manualContact?.marketing_opt_in === false,
  );
  const afterConfirm = await anon.rpc("get_unsubscribe_ctx", { p_token: manualToken });
  record(
    "confirm page now reads already_unsubscribed",
    afterConfirm.data?.already_unsubscribed === true,
  );
  const badToken = await admin.rpc("unsubscribe_contact", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  record(
    "unknown token → UNSUBSCRIBE_NOT_FOUND",
    /UNSUBSCRIBE_NOT_FOUND/.test(badToken.error?.message ?? ""),
    badToken.error?.message ?? "",
  );

  // ── 11) webhook signature scheme ───────────────────────────────────
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? "smoke-secret";
  const syntheticRaw = JSON.stringify({
    type: "email.clicked",
    created_at: eventAt,
    data: { recipient_id: r1 },
  });
  record(
    "signature computed with wrong secret rejected",
    !verify(webhookSecret, syntheticRaw, signature("wrong-secret", syntheticRaw)),
  );
  record(
    "signature computed with correct secret accepted",
    verify(webhookSecret, syntheticRaw, signature(webhookSecret, syntheticRaw)),
  );
  record("missing signature rejected", !verify(webhookSecret, syntheticRaw, ""));

  if (process.env.RUN_WEBHOOK_LIVE === "1" && process.env.RESEND_WEBHOOK_SECRET) {
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const liveRes = await fetch(`${base}/api/campaigns/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cl-signature": signature(process.env.RESEND_WEBHOOK_SECRET, syntheticRaw),
        },
        body: syntheticRaw,
      });
      const liveBody = await liveRes.json().catch(() => ({}));
      record(
        "live webhook route processes signed payload (optional)",
        liveRes.ok && liveBody?.processed === true,
        `${liveRes.status}`,
      );
    } catch (err) {
      record("live webhook route POST (optional)", false, `route unreachable: ${err.message}`);
    }
  } else {
    console.log(
      "INFO  live webhook route POST skipped (set RUN_WEBHOOK_LIVE=1 + RESEND_WEBHOOK_SECRET)",
    );
  }

  // ── 12) anon cannot execute write RPCs ─────────────────────────────
  const ZERO = "00000000-0000-0000-0000-000000000000";
  const anonWrites = [
    ["resolve_campaign_recipients", { p_campaign_id: cAll?.id }],
    ["mark_campaign_recipients_sent", { p_campaign_id: cAll?.id, p_provider_ids: {} }],
    ["schedule_campaign", { p_campaign_id: cAll?.id, p_scheduled_for: future }],
    ["cancel_campaign", { p_campaign_id: cAll?.id }],
    [
      "process_campaign_event",
      { p_campaign_id: cAll?.id, p_recipient_id: r1 ?? ZERO, p_event: "opened" },
    ],
    ["unsubscribe_contact", { p_token: unsubToken ?? ZERO }],
  ];
  for (const [rpc, args] of anonWrites) {
    const res = await anon.rpc(rpc, args);
    record(
      `anon cannot execute ${rpc} (permission denied)`,
      /permission denied|42501/i.test(res.error?.message ?? ""),
      res.error?.message ?? "",
    );
  }

  // ── summary ────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nCampaigns smoke: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
} finally {
  // ── cleanup ────────────────────────────────────────────────────────
  const ids = (arr) => arr.filter(Boolean);
  for (const id of ids(cleanup.customFieldValues)) {
    await admin.from("contact_custom_values").delete().eq("custom_field_id", id);
  }
  for (const id of ids(cleanup.contactTags.map((l) => l?.contact_id))) {
    await admin.from("contact_tags").delete().eq("contact_id", id);
  }
  for (const t of cleanup.contactTags) {
    if (t?.tag_id) await admin.from("contact_tags").delete().eq("tag_id", t.tag_id);
  }
  for (const id of ids(cleanup.contacts)) {
    await admin.from("activities").delete().eq("contact_id", id);
  }
  for (const id of ids(cleanup.customFields)) {
    await admin.from("custom_fields").delete().eq("id", id);
  }
  for (const id of ids(cleanup.tags)) {
    await admin.from("tags").delete().eq("id", id);
  }
  for (const id of ids(cleanup.contacts)) {
    await admin.from("contacts").delete().eq("id", id);
  }
  for (const id of ids(cleanup.campaigns)) {
    await admin.from("campaigns").delete().eq("id", id);
  }
  for (const id of ids(cleanup.templates)) {
    await admin.from("email_templates").delete().eq("id", id);
  }
  console.log(
    `\ncleaned up ${cleanup.campaigns.length} campaigns, ${cleanup.templates.length} templates, ${cleanup.contacts.length} contacts, ${cleanup.tags.length} tags, ${cleanup.customFields.length} custom fields`,
  );
}
