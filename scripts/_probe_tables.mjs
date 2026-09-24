/**
 * TEMP probe — checks which migration tables exist in the live Supabase DB.
 * Prints only table names + exists flag. Never prints secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
function loadLocalEnv() {
  try {
    const text = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}
loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("MISSING NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const client = createClient(url, serviceKey);

const tables = [
  // 0001 M1
  "organizations", "profiles", "organization_members",
  // 0003 M2
  "contacts", "tags", "contact_tags", "custom_fields", "contact_custom_values", "leads", "activities",
  // 0004 M3
  "services", "public_forms", "form_fields", "resources", "resource_gates", "form_submission_events",
  // 0005 M4
  "availability_rules", "blocked_times", "appointments",
  // 0006 M5
  "email_templates", "campaigns", "campaign_recipients",
  // 0007 M6
  "tasks", "automations", "audit_logs",
  // 0015 M6.5
  "automation_actions",
  // 0016 M8
  "integrations", "imported_calendar_events",
];

const out = [];
for (const t of tables) {
  const { error } = await client.from(t).select("id", { head: true, count: "exact" });
  const missing = !!error && /could not find the table|does not exist|PGRST205/i.test(error.message ?? "");
  out.push({ table: t, exists: !missing, note: error && !missing ? `err: ${error.message}` : "" });
}

// Also probe the key RPCs used by cron/booking flows.
const rpcs = [
  ["get_available_slots", { p_slug: "first-client", p_service_id: "00000000-0000-0000-0000-000000000000", p_date: "2026-10-01" }],
  ["list_campaign_recipients", null],
  ["send_campaign_emails", null],
  ["enqueue_automation_action", null],
  ["run_automation_steps", null],
  ["log_activity", null],
  ["log_audit", null],
];
for (const [fn, args] of rpcs) {
  const { error } = await client.rpc(fn, args ?? {});
  const missing = !!error && /could not find|does not exist|PGRST202|PGRST205/i.test(error.message ?? "");
  out.push({ rpc: fn, exists: !missing, note: error && !missing ? `err: ${error.message}` : "" });
}

for (const row of out) {
  console.log(`${row.exists ? "OK  " : "MISS"}  ${row.table ?? row.rpc}${row.note ? `   [${row.note}]` : ""}`);
}
const missingCount = out.filter((r) => !r.exists).length;
console.log(`\n${out.length - missingCount}/${out.length} probes present; ${missingCount} missing`);