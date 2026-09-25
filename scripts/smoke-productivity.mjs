#!/usr/bin/env node
/**
 * M6 Productivity smoke test against the live project.
 *
 * Verifies the productivity milestone after migration 0007 is applied:
 *   - tasks / automations / audit_logs tables + the seeded automation
 *     config rows for the "first-client" demo org
 *   - anon has NO table grants and cannot execute the new RPCs
 *     (log_audit / get_user_email / create_follow_up_task are all
 *     revoked from PUBLIC per the M4 fix idiom)
 *   - tasks CRUD via the service role
 *   - log_audit: happy path writes a row, non-member actor rejected,
 *     null actor rejected (AUDIT_ACTOR_REQUIRED)
 *   - get_user_email: member email resolves, non-member → null
 *   - automation triggers fire on EXISTING table DML (no M1–M4 RPC
 *     touched): appointment insert → appointment_booked task, update to
 *     'Completed' → appointment_completed task, resource download bump →
 *     resource_downloaded task, form_submission_events insert →
 *     form_submitted task; each with a follow_up_task_created activity
 *   - analytics counts are computable (defensive re campaign stats,
 *     which are null while the M5 tables are missing)
 *
 * Requires .env.local with Supabase creds.
 * Run: node scripts/smoke-productivity.mjs
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
  console.log("SKIP  Productivity smoke — Supabase env not fully configured.");
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
const cleanup = {
  tasks: [],
  activities: [],
  appointments: [],
  resources: [],
  forms: [],
  audit: [],
};

// Far-future slot that no booking flow will ever touch (today is 2026).
const APPT_START = "2030-01-07T15:00:00-04:00";
const APPT_END = new Date(new Date(APPT_START).getTime() + 30 * 60_000).toISOString();

try {
  // ── 0) tables + org ─────────────────────────────────────────────────
  const EXPECTED_TABLES = ["tasks", "automations", "audit_logs"];
  let allTables = true;
  for (const t of EXPECTED_TABLES) {
    const { error } = await admin.from(t).select("id").limit(1);
    const ok = !error || !/could not find the table/i.test(error.message);
    if (!ok) allTables = false;
    record(`table ${t} exists`, ok);
  }
  if (!allTables) {
    console.log("\nMigration 0007 does not appear to be applied yet.");
    console.log(
      "Open Supabase dashboard → SQL editor, paste supabase/migrations/20260923000007_m6_productivity.sql, run it.",
    );
    process.exitCode = 1;
    process.exit(0);
  }

  const { data: orgRow } = await admin
    .from("organizations")
    .select("id, timezone")
    .eq("slug", "first-client")
    .maybeSingle();
  const orgId = orgRow?.id;
  if (!orgId) throw new Error("first-client org not found");

  // ── 1) seeded automations ───────────────────────────────────────────
  const { data: automations } = await admin
    .from("automations")
    .select("id, trigger_type, active, action_config")
    .eq("organization_id", orgId);
  const byTrigger = new Map((automations ?? []).map((a) => [a.trigger_type, a]));
  const TRIGGERS = [
    "appointment_booked",
    "form_submitted",
    "appointment_completed",
    "resource_downloaded",
  ];
  record(
    "seeded 4 automations for first-client",
    TRIGGERS.length === 4 && TRIGGERS.every((t) => byTrigger.has(t)),
    `${(automations ?? []).length} rows`,
  );
  record(
    "seeded automations active with follow-up task enabled",
    TRIGGERS.every((t) => {
      const a = byTrigger.get(t);
      return a?.active === true && a?.action_config?.create_follow_up_task === true;
    }),
  );

  // ── 2) anon has NO grants / RPC access ──────────────────────────────
  for (const t of EXPECTED_TABLES) {
    const probe = await anon.from(t).select("id").limit(1);
    record(`anon cannot read ${t} table (no grants)`, !!probe.error);
  }

  const anonAudit = await anon.rpc("log_audit", {
    p_organization_id: orgId,
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_action: "hack",
    p_entity_type: "task",
    p_entity_id: null,
    p_before: null,
    p_after: null,
  });
  record(
    "anon cannot execute log_audit (revoked from PUBLIC)",
    /permission denied|42501/i.test(anonAudit.error?.message ?? ""),
    anonAudit.error?.message ?? "",
  );

  const anonEmail = await anon.rpc("get_user_email", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
  });
  record(
    "anon cannot execute get_user_email (revoked from PUBLIC)",
    /permission denied|42501/i.test(anonEmail.error?.message ?? ""),
    anonEmail.error?.message ?? "",
  );

  const anonTask = await anon.rpc("create_follow_up_task", {
    p_org_id: orgId,
    p_trigger: "appointment_booked",
    p_config: {},
    p_title: "hack",
  });
  record(
    "anon cannot execute create_follow_up_task (service role only)",
    /permission denied|42501/i.test(anonTask.error?.message ?? ""),
    anonTask.error?.message ?? "",
  );

  // ── 3) tasks CRUD (service role) ────────────────────────────────────
  const { data: scratchTask, error: insErr } = await admin
    .from("tasks")
    .insert({
      organization_id: orgId,
      title: `Smoke task ${tag}`,
      description: "m6 smoke",
      priority: "Normal",
      status: "Open",
    })
    .select("id")
    .single();
  record("task insert succeeds", !insErr && !!scratchTask?.id, insErr?.message ?? "");
  const scratchTaskId = scratchTask?.id;
  if (scratchTaskId) cleanup.tasks.push(scratchTaskId);

  const { data: taskRows } = await admin
    .from("tasks")
    .select("id, title, status")
    .eq("id", scratchTaskId);
  record("task select returns the row", (taskRows ?? []).length === 1);

  const { error: updErr } = await admin
    .from("tasks")
    .update({ status: "Completed" })
    .eq("id", scratchTaskId);
  const { data: doneRow } = await admin
    .from("tasks")
    .select("status")
    .eq("id", scratchTaskId)
    .maybeSingle();
  record("task update persists", !updErr && doneRow?.status === "Completed", updErr?.message ?? "");

  // ── 4) log_audit ────────────────────────────────────────────────────
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .limit(1);
  const memberId = members?.[0]?.user_id ?? null;
  record("first-client has an org member (audit actor)", !!memberId, memberId ?? "");

  const auditRes = await admin.rpc("log_audit", {
    p_organization_id: orgId,
    p_user_id: memberId,
    p_action: "smoke.test",
    p_entity_type: "task",
    p_entity_id: scratchTaskId,
    p_before: { status: "Open" },
    p_after: { status: "Completed" },
  });
  const auditId = auditRes.data ?? null;
  record("log_audit returns an id", !!auditId, auditRes.error?.message ?? "");
  if (auditId) cleanup.audit.push(auditId);

  const { data: auditRows } = await admin
    .from("audit_logs")
    .select("id, action, user_id")
    .eq("id", auditId);
  record(
    "audit row written with actor",
    (auditRows ?? []).some((r) => r.action === "smoke.test" && r.user_id === memberId),
  );

  const badActor = await admin.rpc("log_audit", {
    p_organization_id: orgId,
    p_user_id: "11111111-1111-1111-1111-111111111111",
    p_action: "smoke.test",
    p_entity_type: "task",
    p_entity_id: null,
    p_before: null,
    p_after: null,
  });
  record(
    "log_audit rejects non-member actor",
    /AUDIT_NOT_MEMBER/.test(badActor.error?.message ?? ""),
    badActor.error?.message ?? "",
  );

  const noActor = await admin.rpc("log_audit", {
    p_organization_id: orgId,
    p_user_id: null,
    p_action: "smoke.test",
    p_entity_type: "task",
    p_entity_id: null,
    p_before: null,
    p_after: null,
  });
  record(
    "log_audit rejects null actor",
    /AUDIT_ACTOR_REQUIRED/.test(noActor.error?.message ?? ""),
    noActor.error?.message ?? "",
  );

  // ── 5) get_user_email ───────────────────────────────────────────────
  const who = await admin.rpc("get_user_email", { p_user_id: memberId });
  record(
    "member email resolves",
    typeof who.data === "string" && who.data.length > 0,
    who.data ?? who.error?.message ?? "",
  );

  const ghost = await admin.rpc("get_user_email", {
    p_user_id: "11111111-1111-1111-1111-111111111111",
  });
  record("non-member target → null (no leak)", ghost.data === null);

  // ── helper: find tasks the triggers created ─────────────────────────
  const findTaskByAppointment = async (apptId, titlePrefix) => {
    const { data } = await admin
      .from("tasks")
      .select("id, title")
      .eq("organization_id", orgId)
      .eq("appointment_id", apptId)
      .ilike("title", `${titlePrefix}%`);
    return data ?? [];
  };

  // ── 6) appointment_booked + appointment_completed triggers ───────────
  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .insert({
      organization_id: orgId,
      starts_at: APPT_START,
      ends_at: APPT_END,
      timezone: "America/St_Johns",
      customer_name: `Trigger Smoke ${tag}`,
      customer_email: `trigger-${tag}@example.com`,
      status: "Scheduled",
    })
    .select("id")
    .single();
  const apptId = appt?.id ?? null;
  record(
    "appointment insert succeeds (far-future slot)",
    !apptErr && !!apptId,
    apptErr?.message ?? "",
  );
  if (apptId) cleanup.appointments.push(apptId);

  const bookedTasks = apptId ? await findTaskByAppointment(apptId, "Follow up: Trigger Smoke") : [];
  record(
    "appointment_booked trigger creates follow-up task",
    bookedTasks.length === 1,
    bookedTasks.map((t) => t.title).join(","),
  );
  for (const t of bookedTasks) if (t.id) cleanup.tasks.push(t.id);

  const { error: completeErr } = await admin
    .from("appointments")
    .update({ status: "Completed" })
    .eq("id", apptId);
  const completedTasks = apptId
    ? await findTaskByAppointment(apptId, "Follow up after completed appointment")
    : [];
  record(
    "appointment_completed trigger creates follow-up task",
    !completeErr && completedTasks.length === 1,
    completeErr?.message ?? "",
  );
  for (const t of completedTasks) if (t.id) cleanup.tasks.push(t.id);

  // activities were logged for each trigger
  const linkedTaskIds = [...bookedTasks, ...completedTasks].map((t) => t.id);
  const activityCheck = [];
  for (const taskId of linkedTaskIds) {
    const { data: acts } = await admin
      .from("activities")
      .select("id, activity_type, metadata")
      .eq("organization_id", orgId)
      .eq("activity_type", "follow_up_task_created")
      .filter("metadata->>task_id", "eq", taskId);
    for (const a of acts ?? []) {
      activityCheck.push(taskId);
      cleanup.activities.push(a.id);
    }
  }
  record(
    "follow_up_task_created activity logged per trigger task",
    linkedTaskIds.length > 0 && linkedTaskIds.every((id) => activityCheck.includes(id)),
    `${activityCheck.length}/${linkedTaskIds.length}`,
  );

  // ── 7) resource_downloaded trigger ──────────────────────────────────
  const { data: resource, error: resErr } = await admin
    .from("resources")
    .insert({
      organization_id: orgId,
      title: `Smoke resource ${tag}`,
      description: "m6 smoke",
      file_path: `smoke/${tag}.txt`,
      file_name: `${tag}.txt`,
      mime_type: "text/plain",
      file_size: 3,
      visibility: "private",
      published: true,
      gated: false,
    })
    .select("id")
    .single();
  const resourceId = resource?.id ?? null;
  record("resource insert succeeds", !resErr && !!resourceId, resErr?.message ?? "");
  if (resourceId) cleanup.resources.push(resourceId);

  await admin.from("resources").update({ download_count: 1 }).eq("id", resourceId);
  const { data: dlTasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("organization_id", orgId)
    .ilike("title", `Follow up: "Smoke resource ${tag}"%`);
  record(
    "resource_downloaded trigger creates follow-up task",
    (dlTasks ?? []).length === 1,
    (dlTasks ?? []).map((t) => t.title).join(","),
  );
  for (const t of dlTasks ?? []) if (t.id) cleanup.tasks.push(t.id);
  for (const t of dlTasks ?? []) {
    const { data: acts } = await admin
      .from("activities")
      .select("id")
      .eq("organization_id", orgId)
      .eq("activity_type", "follow_up_task_created")
      .filter("metadata->>task_id", "eq", t.id);
    for (const a of acts ?? []) cleanup.activities.push(a.id);
  }

  // ── 8) form_submitted trigger ───────────────────────────────────────
  const { data: form, error: formErr } = await admin
    .from("public_forms")
    .insert({
      organization_id: orgId,
      name: `Smoke form ${tag}`,
      slug: `smoke-${tag}`,
    })
    .select("id")
    .single();
  const formId = form?.id ?? null;
  record("public form insert succeeds", !formErr && !!formId, formErr?.message ?? "");
  if (formId) cleanup.forms.push(formId);

  await admin.from("form_submission_events").insert({
    form_id: formId,
    ip_hash: `smoke-${tag}`,
  });
  const formTitle = `Follow up: form "Smoke form ${tag}" submitted`;
  const { data: formTasks } = await admin
    .from("tasks")
    .select("id, title")
    .eq("organization_id", orgId)
    .eq("title", formTitle);
  record(
    "form_submitted trigger creates follow-up task",
    (formTasks ?? []).length === 1,
    (formTasks ?? []).map((t) => t.title).join(","),
  );
  for (const t of formTasks ?? []) if (t.id) cleanup.tasks.push(t.id);
  for (const t of formTasks ?? []) {
    const { data: acts } = await admin
      .from("activities")
      .select("id")
      .eq("organization_id", orgId)
      .eq("activity_type", "follow_up_task_created")
      .filter("metadata->>task_id", "eq", t.id);
    for (const a of acts ?? []) cleanup.activities.push(a.id);
  }

  // ── 9) analytics counters are computable ────────────────────────────
  const { count: contactCount } = await admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("archived_at", null);
  record("total contacts computable", typeof contactCount === "number", String(contactCount));

  const { count: openLeadCount } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .not("stage", "in", '("Won","Lost")');
  record("open leads computable", typeof openLeadCount === "number", String(openLeadCount));

  const { count: upcomingCount } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", ["Scheduled", "Confirmed"])
    .gte("starts_at", new Date().toISOString());
  record(
    "upcoming appointments computable",
    typeof upcomingCount === "number",
    String(upcomingCount),
  );

  const { count: pendingCount } = await admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", ["Open", "In Progress"]);
  record("pending tasks computable", typeof pendingCount === "number", String(pendingCount));

  // Campaign stats are defensive: null when the M5 tables are missing,
  // real numbers once M5 lands (opened_at / clicked_at are M5 columns).
  let campaignOk = true;
  let campaignDetail = "M5 tables missing → analytics shows —";
  try {
    const {
      data: cData,
      error: cErr,
      count: sentCount,
    } = await admin
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "Sent");
    if (cErr || cData === null) {
      campaignOk = true; // defensive branch
    } else {
      const { data: rData, error: rErr } = await admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not("opened_at", "is", null);
      campaignOk = !rErr;
      campaignDetail = `campaigns=${sentCount}, opened=on M5 tables`;
      if (rErr && !/could not find the table/i.test(rErr.message)) campaignOk = false;
    }
    void cData;
  } catch {
    campaignOk = true;
  }
  record("campaign stats guarded (defensive)", campaignOk, campaignDetail);

  // ── 10) cleanup sanity: delete previously-created scratch task ──────
  const { error: delErr } = await admin.from("tasks").delete().eq("id", scratchTaskId);
  record("task delete succeeds", !delErr, delErr?.message ?? "");

  // ── summary ────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nProductivity smoke: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
} finally {
  // ── cleanup (service role; activity rows first, they never cascade) ─
  const ids = (arr) => arr.filter(Boolean);
  for (const id of ids(cleanup.activities)) {
    await admin.from("activities").delete().eq("id", id);
  }
  for (const id of ids(cleanup.tasks)) {
    await admin.from("tasks").delete().eq("id", id);
  }
  for (const id of ids(cleanup.audit)) {
    await admin.from("audit_logs").delete().eq("id", id);
  }
  for (const id of ids(cleanup.appointments)) {
    await admin.from("appointments").delete().eq("id", id);
  }
  for (const id of ids(cleanup.resources)) {
    await admin.from("resources").delete().eq("id", id);
  }
  for (const id of ids(cleanup.forms)) {
    await admin.from("public_forms").delete().eq("id", id); // cascades submission events
  }
  console.log(
    `\ncleaned up ${cleanup.activities.length} activities, ${cleanup.tasks.length} tasks, ` +
      `${cleanup.audit.length} audit rows, ${cleanup.appointments.length} appointments, ` +
      `${cleanup.resources.length} resources, ${cleanup.forms.length} public forms`,
  );
}
