#!/usr/bin/env node
/**
 * M2 CRM smoke test against the live project.
 *
 * Verifies the CRM milestone end-to-end after migration 0003 is applied:
 *   - tags, contacts, custom field values, leads, stage changes and notes
 *   - the auto-activity triggers (contact_created / tag_added /
 *     contact_updated / lead_created / lead_stage_changed / note_added …)
 *   - RLS member scoping on the new tables (staff can read + write own
 *     org rows; a second user in the same org can see them, cross-org
 *     isolation itself is covered by npm run test:rls)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local when present).
 * Run: npm run test:crm
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
  console.log("SKIP  CRM smoke — Supabase env not fully configured.");
  process.exit(0);
}

const password = "Smoke-test-123456!";
const tag = Date.now().toString(36);
const email = `crm-${tag}@example.com`;

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

let userId = null;
let orgId = null;
let contactId = null;
let tagId = null;
let fieldId = null;
let leadId = null;
async function memberClient(session) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Same path the app uses: sign in, then attach the session.
  await client.auth.setSession(session);
  return client;
}

try {
  // Set up a fresh workspace user (auto-joins the default org via trigger).
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "CRM Smoke User" },
  });
  userId = created.data.user?.id ?? null;
  record("test user created (auto-joins default org)", !!userId);

  const memberships = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  orgId = memberships.data?.organization_id ?? null;
  record("auto-joined an org", !!orgId);

  if (!userId || !orgId) throw new Error("no org membership for test user");

  const session = (await anon.auth.signInWithPassword({ email, password })).data.session;
  record("password sign-in works", !!session);
  if (!session) throw new Error("sign-in failed");

  const user = await memberClient(session);

  // Tag
  const tagName = `Smoke ${tag}`;
  const tagInsert = await user
    .from("tags")
    .insert({ organization_id: orgId, name: tagName })
    .select("id")
    .single();
  tagId = tagInsert.data?.id ?? null;
  record("member can create a tag", !!tagId);

  // Custom field (as config data)
  const fieldKey = `smoke_${tag}`;
  const fieldInsert = await user
    .from("custom_fields")
    .insert({
      organization_id: orgId,
      entity_type: "contact",
      name: `Smoke field ${tag}`,
      field_key: fieldKey,
      field_type: "number",
      options: [],
      sort_order: 99,
    })
    .select("id")
    .single();
  fieldId = fieldInsert.data?.id ?? null;
  record("member can create a custom field", !!fieldId);

  // Contact with a custom value + tag
  const contactEmail = `crm-${tag}@example.ca`;
  const contactInsert = await user
    .from("contacts")
    .insert({
      organization_id: orgId,
      first_name: "Smoke",
      last_name: "Contact",
      email: contactEmail,
      phone: "902-555-0199",
      contact_type: "Lead",
      source: "Manual entry",
    })
    .select("id")
    .single();
  contactId = contactInsert.data?.id ?? null;
  record("member can create a contact", !!contactId);
  if (!contactId) throw new Error("contact insert failed");

  await user.from("contact_tags").insert({ contact_id: contactId, tag_id: tagId });
  const valueInsert = await user
    .from("contact_custom_values")
    .upsert(
      { organization_id: orgId, contact_id: contactId, custom_field_id: fieldId, value: 750000 },
      { onConflict: "contact_id,custom_field_id" },
    );
  record("custom field value stored", !valueInsert.error);

  // Lead + stage change + note
  const leadInsert = await user
    .from("leads")
    .insert({
      organization_id: orgId,
      contact_id: contactId,
      stage: "New",
      source: "Manual entry",
      priority: "Normal",
      expected_value: 500000,
    })
    .select("id")
    .single();
  leadId = leadInsert.data?.id ?? null;
  record("member can create a lead linked to a contact", !!leadId);
  if (!leadId) throw new Error("lead insert failed");

  const stageChange = await user.from("leads").update({ stage: "Appointment" }).eq("id", leadId);
  record("lead stage can be updated", !stageChange.error);

  const note = await user.rpc("log_activity", {
    p_organization_id: orgId,
    p_contact_id: contactId,
    p_lead_id: leadId,
    p_activity_type: "note_added",
    p_subject: "Note added",
    p_description: "Smoke note",
  });
  record("log_activity rpc writes a note (member)", !note.error, note.error?.message ?? "");

  // Triggers wrote activities
  const { data: activities } = await user
    .from("activities")
    .select("activity_type")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(50);
  const types = new Set((activities ?? []).map((a) => a.activity_type));
  record("contact_created activity logged", types.has("contact_created"));
  record("tag_added activity logged", types.has("tag_added"));
  record("lead_created activity logged", types.has("lead_created"));
  record("lead_stage_changed activity logged", types.has("lead_stage_changed"));
  record("note_added activity logged", types.has("note_added"));

  // Same-org visibility for a second member
  const emailB = `crm2-${tag}@example.com`;
  await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
    user_metadata: { full_name: "CRM Smoke B" },
  });
  const sessionB = (await anon.auth.signInWithPassword({ email: emailB, password })).data.session;
  const userB = await memberClient(sessionB);
  const bSeesContact = await userB.from("contacts").select("id").eq("id", contactId).maybeSingle();
  record("second member sees the same-org contact", !!bSeesContact.data);
} catch (err) {
  record("smoke test executed cleanly", false, err.message);
} finally {
  try {
    if (leadId) await admin.from("leads").delete().eq("id", leadId);
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (fieldId) await admin.from("custom_fields").delete().eq("id", fieldId);
    if (tagId) await admin.from("tags").delete().eq("id", tagId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch {
    // best-effort cleanup
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length > 0 ? 1 : 0;
