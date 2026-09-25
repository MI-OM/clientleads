#!/usr/bin/env node
/**
 * M6.5 Advanced automations smoke test against the live project.
 *
 * Verifies the step-based workflow engine after migration 00015 is applied:
 *   - 8 seeded automations for the "first-client" demo org: the 4 legacy
 *     rows keep their flat 0007 shape (smoke-productivity covers them),
 *     and 4 NEW triggers (contact_created, lead_stage_changed,
 *     appointment_cancelled, appointment_no_show) carry steps[] configs.
 *   - anon has NO access: automation_actions is unreadable and the new
 *     RPCs (ensure_contact_tag / enqueue_automation_action /
 *     run_automation_steps) are revoked from PUBLIC (M4 idiom).
 *   - contact_created fires a synchronous create_task + add_tags step
 *     (auto-creates the "New" tag and links it to the contact).
 *   - lead_stage_changed fires only when a lead moves INTO the configured
 *     stage (Qualified); other stage changes don't create a task.
 *   - appointment_cancelled / appointment_no_show create follow-up tasks;
 *     appointment_no_show additionally queues a notify step.
 *   - app-drained steps (send_email / delayed steps) are ENQUEUED with a
 *     future run_at instead of executing in the trigger.
 *
 * Requires .env.local with Supabase creds.
 * Run: node scripts/smoke-automations.mjs
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
      process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // .env.local missing — the createClient calls below will fail loudly.
  }
}
loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
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
const cleanup = {
  tasks: [],
  contacts: [],
  leads: [],
  appointments: [],
  queue: [],
  contactTags: [],
  tags: [],
};

const APPT_START = "2030-02-07T15:00:00-04:00";
const APPT_END = new Date(new Date(APPT_START).getTime() + 30 * 60_000).toISOString();

let ccAutomation = null;
let originalConfig = null;

try {
  // ── 0) queue table + org ────────────────────────────────────────────
  const { error: queueErr } = await admin.from("automation_actions").select("id").limit(1);
  if (queueErr && /could not find the table/i.test(queueErr.message)) {
    console.log("\nMigration 00015 does not appear to be applied yet.");
    console.log(
      "Open Supabase dashboard → SQL editor, paste supabase/migrations/20260923000015_m6_advanced_automations.sql, run it.",
    );
    process.exitCode = 1;
    process.exit(0);
  }
  record("automation_actions table exists", !queueErr, queueErr?.message ?? "");

  const { data: orgRow } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "first-client")
    .maybeSingle();
  const orgId = orgRow?.id;
  if (!orgId) throw new Error("first-client org not found");

  // ── 1) seeded automations (4 legacy flat + 4 new steps[]) ───────────
  const { data: automations } = await admin
    .from("automations")
    .select("id, trigger_type, active, action_config")
    .eq("organization_id", orgId);
  const byTrigger = new Map((automations ?? []).map((a) => [a.trigger_type, a]));
  const NEW_TRIGGERS = [
    "contact_created",
    "lead_stage_changed",
    "appointment_cancelled",
    "appointment_no_show",
  ];
  const LEGACY_TRIGGERS = [
    "appointment_booked",
    "form_submitted",
    "appointment_completed",
    "resource_downloaded",
  ];
  record(
    "8 automations seeded for first-client",
    (automations ?? []).length === 8 &&
      [...NEW_TRIGGERS, ...LEGACY_TRIGGERS].every((t) => byTrigger.has(t)),
    `${(automations ?? []).length} rows`,
  );
  record(
    "new triggers active with steps[] config",
    NEW_TRIGGERS.every((t) => {
      const a = byTrigger.get(t);
      return a?.active === true && Array.isArray(a?.action_config?.steps);
    }),
  );
  record(
    "legacy triggers keep flat config (M6 byte-compat)",
    LEGACY_TRIGGERS.every((t) => {
      const a = byTrigger.get(t);
      return a?.active === true && a?.action_config?.create_follow_up_task === true;
    }),
  );

  // ── 2) anon has NO table grants / RPC access ────────────────────────
  const anonQueue = await anon.from("automation_actions").select("id").limit(1);
  record(
    "anon cannot read automation_actions",
    !!anonQueue.error && /permission denied/i.test(anonQueue.error.message ?? ""),
    anonQueue.error?.message ?? "",
  );

  const anonEnsure = await anon.rpc("ensure_contact_tag", {
    p_org_id: orgId,
    p_contact_id: "00000000-0000-0000-0000-000000000000",
    p_tag_name: "hack",
  });
  record(
    "anon cannot execute ensure_contact_tag (revoked from PUBLIC)",
    /permission denied|42501/i.test(anonEnsure.error?.message ?? ""),
    anonEnsure.error?.message ?? "",
  );

  const anonEnqueue = await anon.rpc("enqueue_automation_action", {
    p_org_id: orgId,
    p_trigger: "contact_created",
    p_step: { type: "notify" },
  });
  record(
    "anon cannot execute enqueue_automation_action (revoked from PUBLIC)",
    /permission denied|42501/i.test(anonEnqueue.error?.message ?? ""),
    anonEnqueue.error?.message ?? "",
  );

  const anonRun = await anon.rpc("run_automation_steps", {
    p_org_id: orgId,
    p_trigger: "contact_created",
    p_config: { steps: [] },
  });
  record(
    "anon cannot execute run_automation_steps (revoked from PUBLIC)",
    /permission denied|42501/i.test(anonRun.error?.message ?? ""),
    anonRun.error?.message ?? "",
  );

  // ── 3) contact_created: create_task + add_tags (synchronous) ────────
  const { data: contact, error: contactErr } = await admin
    .from("contacts")
    .insert({
      organization_id: orgId,
      first_name: "Auto",
      last_name: `Smoke ${tag}`,
      email: `auto-${tag}@example.com`,
      contact_type: "Lead",
      source: "Manual entry",
    })
    .select("id")
    .single();
  const contactId = contact?.id ?? null;
  record("contact insert succeeds", !contactErr && !!contactId, contactErr?.message ?? "");
  if (contactId) cleanup.contacts.push(contactId);

  const { data: createdTasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .ilike("title", "Follow up: Auto Smoke%");
  record(
    "contact_created runs synchronous create_task",
    (createdTasks ?? []).length === 1,
    (createdTasks ?? []).map((t) => t.title).join(","),
  );
  for (const t of createdTasks ?? []) if (t.id) cleanup.tasks.push(t.id);

  const { data: newTag } = await admin
    .from("tags")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", "New")
    .maybeSingle();
  let newTagId = newTag?.id ?? null;
  const { data: link } = await admin
    .from("contact_tags")
    .select("contact_id")
    .eq("contact_id", contactId)
    .eq("tag_id", newTagId)
    .maybeSingle();
  record("contact_created add_tags auto-creates + links the tag", !!newTagId && !!link?.contact_id);
  if (contactId && newTagId) cleanup.contactTags.push({ contact_id: contactId, tag_id: newTagId });
  if (newTagId) cleanup.tags.push(newTagId);

  // ── 4) lead_stage_changed: fires only moving INTO Qualified ─────────
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .insert({
      organization_id: orgId,
      contact_id: contactId,
      stage: "New",
      source: "Manual entry",
      priority: "Normal",
    })
    .select("id")
    .single();
  const leadId = lead?.id ?? null;
  record("lead insert succeeds", !leadErr && !!leadId, leadErr?.message ?? "");
  if (leadId) cleanup.leads.push(leadId);

  const findLeadTasks = async () => {
    const { data } = await admin
      .from("tasks")
      .select("id, title")
      .eq("organization_id", orgId)
      .eq("lead_id", leadId)
      .ilike("title", "Follow up: lead moved to%");
    return data ?? [];
  };
  const stageNewTasks = await findLeadTasks();
  record(
    "lead created in 'New' does NOT fire Qualified automation",
    stageNewTasks.length === 0,
    stageNewTasks.map((t) => t.title).join(","),
  );

  await admin.from("leads").update({ stage: "Appointment" }).eq("id", leadId);
  const stageContactedTasks = await findLeadTasks();
  record("stage -> Appointment still below the Qualified gate", stageContactedTasks.length === 0);

  const { error: qualifyErr } = await admin
    .from("leads")
    .update({ stage: "Qualified" })
    .eq("id", leadId);
  const qualifiedTasks = await findLeadTasks();
  record(
    "stage -> Qualified fires create_task",
    !qualifyErr && qualifiedTasks.length === 1,
    qualifiedTasks.map((t) => t.title).join(","),
  );
  for (const t of qualifiedTasks) if (t.id) cleanup.tasks.push(t.id);

  // ── 5) appointment_cancelled ────────────────────────────────────────
  const mkAppt = async (name) => {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        organization_id: orgId,
        starts_at: APPT_START,
        ends_at: APPT_END,
        timezone: "America/St_Johns",
        customer_name: name,
        customer_email: `appt-${tag}@example.com`,
        status: "Scheduled",
      })
      .select("id")
      .single();
    return { id: data?.id ?? null, error };
  };

  const { id: apptC, error: apptCErr } = await mkAppt(`Cancelled Smoke ${tag}`);
  record(
    "appointment insert succeeds (cancelled case)",
    !apptCErr && !!apptC,
    apptCErr?.message ?? "",
  );
  if (apptC) cleanup.appointments.push(apptC);

  const { error: cancelErr } = await admin
    .from("appointments")
    .update({ status: "Cancelled" })
    .eq("id", apptC);
  const { data: cancelledTasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("organization_id", orgId)
    .eq("appointment_id", apptC)
    .ilike("title", "Follow up: appointment cancelled (%)%");
  record(
    "appointment_cancelled triggers follow-up task",
    !cancelErr && (cancelledTasks ?? []).length === 1,
    (cancelledTasks ?? []).map((t) => t.title).join(","),
  );
  for (const t of cancelledTasks ?? []) if (t.id) cleanup.tasks.push(t.id);

  // ── 6) appointment_no_show: task + queued notify ────────────────────
  const { id: apptN, error: apptNErr } = await mkAppt(`No-show Smoke ${tag}`);
  record(
    "appointment insert succeeds (no-show case)",
    !apptNErr && !!apptN,
    apptNErr?.message ?? "",
  );
  if (apptN) cleanup.appointments.push(apptN);

  const { error: noShowErr } = await admin
    .from("appointments")
    .update({ status: "No-show" })
    .eq("id", apptN);
  const { data: noShowTasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("organization_id", orgId)
    .eq("appointment_id", apptN)
    .ilike("title", "Follow up: no-show (%)%");
  record(
    "appointment_no_show triggers follow-up task",
    !noShowErr && (noShowTasks ?? []).length === 1,
    (noShowTasks ?? []).map((t) => t.title).join(","),
  );
  for (const t of noShowTasks ?? []) if (t.id) cleanup.tasks.push(t.id);

  const { data: notifyRow } = await admin
    .from("automation_actions")
    .select("id, step, run_at, status")
    .eq("organization_id", orgId)
    .eq("appointment_id", apptN)
    .eq("status", "pending")
    .maybeSingle();
  record(
    "no-show notify step enqueued for the app runner",
    !!notifyRow?.id && notifyRow.step?.type === "notify" && notifyRow.status === "pending",
    `run_at=${String(notifyRow?.run_at ?? "?")}`,
  );
  if (notifyRow?.id) cleanup.queue.push(notifyRow.id);

  // ── 7) delayed / app-drained steps enqueue with future run_at ───────
  // Temporarily extend the contact_created automation with a delayed
  // send_email step; the DB trigger must ENQUEUE it, not execute it.
  ccAutomation = byTrigger.get("contact_created");
  if (!ccAutomation?.id) throw new Error("contact_created automation row missing");
  originalConfig = ccAutomation.action_config;

  const { error: patchErr } = await admin
    .from("automations")
    .update({
      action_config: {
        steps: [
          { type: "create_task", title: "", due_in_days: 0 },
          { type: "send_email", template_id: null, delay_hours: 24 },
        ],
        conditions: { skip_unsubscribed: true },
      },
    })
    .eq("id", ccAutomation.id);
  record("temporarily patch contact_created config", !patchErr, patchErr?.message ?? "");

  const { data: delayedContact } = await admin
    .from("contacts")
    .insert({
      organization_id: orgId,
      first_name: "Delayed",
      last_name: `Smoke ${tag}`,
      email: `delayed-${tag}@example.com`,
      contact_type: "Lead",
      source: "Manual entry",
    })
    .select("id")
    .single();
  const delayedContactId = delayedContact?.id ?? null;
  if (delayedContactId) cleanup.contacts.push(delayedContactId);

  const { data: delayedRow } = await admin
    .from("automation_actions")
    .select("id, step, run_at, status")
    .eq("organization_id", orgId)
    .eq("contact_id", delayedContactId)
    .eq("status", "pending")
    .maybeSingle();
  record(
    "delayed send_email step enqueued (not executed in trigger)",
    !!delayedRow?.id &&
      delayedRow.step?.type === "send_email" &&
      delayedRow.status === "pending" &&
      new Date(delayedRow.run_at) > new Date(),
    `run_at=${String(delayedRow?.run_at ?? "?")}, step=${String(delayedRow?.step?.type ?? "?")}`,
  );
  if (delayedRow?.id) cleanup.queue.push(delayedRow.id);

  // synchronous create_task still ran for the same contact
  const { data: delayedTasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("organization_id", orgId)
    .eq("contact_id", delayedContactId);
  record(
    "synchronous steps still run alongside enqueued ones",
    (delayedTasks ?? []).length === 1,
    (delayedTasks ?? []).map((t) => t.title).join(","),
  );
  for (const t of delayedTasks ?? []) if (t.id) cleanup.tasks.push(t.id);

  const { error: restoreErr } = await admin
    .from("automations")
    .update({ action_config: originalConfig })
    .eq("id", ccAutomation.id);
  record("contact_created config restored", !restoreErr, restoreErr?.message ?? "");
} catch (err) {
  record("smoke test executed cleanly", false, err.message);
} finally {
  try {
    // restore config first (in case of an early throw)
    if (ccAutomation?.id && originalConfig) {
      await admin
        .from("automations")
        .update({ action_config: originalConfig })
        .eq("id", ccAutomation.id);
    }
    for (const row of cleanup.contactTags) {
      await admin
        .from("contact_tags")
        .delete()
        .eq("contact_id", row.contact_id)
        .eq("tag_id", row.tag_id);
    }
    for (const id of cleanup.tasks) await admin.from("tasks").delete().eq("id", id);
    for (const id of cleanup.queue) await admin.from("automation_actions").delete().eq("id", id);
    for (const id of cleanup.appointments) {
      // the booked auto-task + any step tasks all hang off the appointment
      const { data: apptTasks } = await admin.from("tasks").select("id").eq("appointment_id", id);
      for (const t of apptTasks ?? []) await admin.from("tasks").delete().eq("id", t.id);
    }
    for (const id of cleanup.appointments) await admin.from("appointments").delete().eq("id", id);
    for (const id of cleanup.leads) await admin.from("leads").delete().eq("id", id);
    for (const id of cleanup.contacts) await admin.from("contacts").delete().eq("id", id);
    for (const id of cleanup.tags) {
      // only remove the auto-created tag if nothing else uses it
      const { data: still = [] } = await admin.from("contact_tags").select("id").eq("tag_id", id);
      if (still.length === 0) await admin.from("tags").delete().eq("id", id);
    }
  } catch {
    // best-effort cleanup
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length > 0 ? 1 : 0;
