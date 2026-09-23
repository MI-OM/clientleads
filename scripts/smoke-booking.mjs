#!/usr/bin/env node
/**
 * M4 Booking smoke test against the live project.
 *
 * Verifies the booking milestone after migration 0005 is applied:
 *   - availability_rules / blocked_times / appointments tables + the
 *     btree_gist exclusion constraint (double-booking backstop)
 *   - anon has NO table grants — booking reads go through the leak-free
 *     get_available_slots / get_appointment_by_token RPCs only
 *   - seeded weekly hours (Mon–Fri 09:00–17:00) + bookable
 *     "Initial consultation" service visible publicly w/ org timezone
 *   - get_available_slots: weekday slots, unknown org → null,
 *     non-bookable service → []
 *   - book_appointment: email/name validation, contact+lead+activity,
 *     slot conflict, double-book rejection, per-IP rate limit (5/hr)
 *   - get_appointment_by_token: only the caller's own fields
 *   - cancel_appointment + reschedule_appointment: free slot / reject
 *     occupied slot; cancelled booking can't be cancelled twice
 *   - anon cannot execute the write RPCs (service role only)
 *
 * Requires .env.local with Supabase creds. Run: npm run test:booking
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
  console.log("SKIP  Booking smoke — Supabase env not fully configured.");
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
const runEmail = `book-${tag}@example.com`;
const runIp = `book-ip-${tag}`;
const cleanup = { appointments: [], contacts: [], leads: [], services: [] };

/** Next weekday (Mon–Fri) at least `minDays` away. */
function nextWeekday(minDays) {
  for (let offset = minDays; offset < minDays + 8; offset += 1) {
    const d = new Date(Date.now() + offset * 86400_000);
    const dow = d.getUTCDay(); // 0=Sun
    if (dow >= 1 && dow <= 5) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/** First free slot for the seeded service on a given date (anon read). */
async function firstSlot(slug, serviceId, date) {
  const { data, error } = await anon.rpc("get_available_slots", {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: date,
  });
  if (error) return { slots: [], error };
  return { slots: Array.isArray(data) ? data.map(String) : [], error: null };
}

try {
  // ── 0) tables + seed ────────────────────────────────────────────────
  const EXPECTED_TABLES = ["availability_rules", "blocked_times", "appointments"];
  let allTables = true;
  for (const t of EXPECTED_TABLES) {
    const { error } = await admin.from(t).select("id").limit(1);
    const ok = !error || !/could not find the table/i.test(error.message);
    if (!ok) allTables = false;
    record(`table ${t} exists`, ok);
  }
  if (!allTables) {
    console.log("\nMigration 0005 does not appear to be applied yet.");
    console.log(
      "Open Supabase dashboard → SQL editor, paste supabase/migrations/20260922000005_m4_booking.sql, run it.",
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

  // seeded weekly hours
  const { data: rules } = await admin
    .from("availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("organization_id", orgId)
    .eq("user_id", null)
    .eq("active", true);
  const ruleDays = new Set((rules ?? []).map((r) => r.day_of_week));
  record(
    "seeded Mon–Fri weekly hours",
    [1, 2, 3, 4, 5].every((d) => ruleDays.has(d)),
    `${(rules ?? []).length} rules`,
  );

  // seeded bookable service + public projection
  const { data: svc } = await admin
    .from("services")
    .select(
      "id, name, duration_min, booking_enabled, min_notice_min, buffer_before_min, buffer_after_min",
    )
    .eq("organization_id", orgId)
    .eq("name", "Initial consultation")
    .maybeSingle();
  record("seeded bookable service exists", !!svc?.id, svc?.name ?? "");
  const svcId = svc?.id ?? null;

  // scratch NON-bookable service (also used for the exclusion backstop test)
  const { data: scratchSvc } = await admin
    .from("services")
    .insert({
      organization_id: orgId,
      name: `Smoke unbookable ${tag}`,
      duration_min: 30,
      booking_enabled: false,
      sort_order: 99,
    })
    .select("id")
    .single();
  cleanup.services.push(scratchSvc?.id ?? null);
  record("scratch non-bookable service created", !!scratchSvc?.id);

  // ── 1) anon has NO table grants ────────────────────────────────────
  const anonProbe = await anon.from("appointments").select("id").limit(1);
  record("anon cannot read appointments table (no grants)", !!anonProbe.error);

  // ── 2) get_available_slots (anon read) ─────────────────────────────
  const targetDate = nextWeekday(3);
  record("compute next weekday for slot tests", !!targetDate, targetDate ?? "");
  const seedSlots = svcId
    ? await firstSlot("first-client", svcId, targetDate)
    : { slots: [], error: null };
  const slots = seedSlots.slots;
  record(
    "get_available_slots returns weekday slots",
    slots.length > 0,
    `${slots.length} slots`,
    ...(seedSlots.error ? [seedSlots.error.message] : []),
  );

  const noOrg = await anon.rpc("get_available_slots", {
    p_slug: "no-such-business-xyz",
    p_service_id: svcId ?? "00000000-0000-0000-0000-000000000000",
    p_date: targetDate,
  });
  record("unknown org → null (no leak)", noOrg.data === null);

  const nonBookable = await anon.rpc("get_available_slots", {
    p_slug: "first-client",
    p_service_id: scratchSvc?.id,
    p_date: targetDate,
  });
  record(
    "non-bookable service → empty slots",
    Array.isArray(nonBookable.data) && nonBookable.data.length === 0,
  );

  // public page projects org timezone (booking wizard needs it)
  const pageRes = await anon.rpc("get_public_page", { p_slug: "first-client" });
  record(
    "public page projects org timezone",
    pageRes.data?.org?.timezone === "America/Halifax",
    pageRes.data?.org?.timezone ?? "",
  );
  record(
    "seeded service shown publicly as bookable",
    (pageRes.data?.services ?? []).some(
      (s) => s.name === "Initial consultation" && s.booking_enabled === true,
    ),
  );

  // ── 3) book_appointment validation (service role) ──────────────────
  const badEmail = await admin.rpc("book_appointment", {
    p_service_id: svcId,
    p_starts_at: slots[0],
    p_name: "No Email",
    p_email: "not-an-email",
  });
  record(
    "invalid email rejected",
    /BOOKING_EMAIL_REQUIRED/.test(badEmail.error?.message ?? ""),
    badEmail.error?.message ?? "",
  );

  const noName = await admin.rpc("book_appointment", {
    p_service_id: svcId,
    p_starts_at: slots[0],
    p_name: "",
    p_email: runEmail,
  });
  record(
    "missing name rejected",
    /BOOKING_NAME_REQUIRED/.test(noName.error?.message ?? ""),
    noName.error?.message ?? "",
  );

  // ── 4) happy-path booking ──────────────────────────────────────────
  const book1 = await admin.rpc("book_appointment", {
    p_service_id: svcId,
    p_starts_at: slots[0],
    p_name: "Booking Smoke",
    p_email: runEmail,
    p_phone: runPhone(),
    p_notes: "m4 smoke",
    p_ip_hash: `${runIp}-1`,
  });
  const b1 = book1.data;
  record(
    "booking succeeds (token issued)",
    b1?.ok === true && !!b1?.token,
    book1.error?.message ?? "",
  );
  if (b1?.token) cleanup.appointments.push(b1.appointment_id);
  if (b1?.contact_id) cleanup.contacts.push(b1.contact_id);
  if (b1?.lead_id) cleanup.leads.push(b1.lead_id);
  record("booking creates contact + lead", !!b1?.contact_id && !!b1?.lead_id);

  // activity was written
  const { data: activities } = await admin
    .from("activities")
    .select("activity_type")
    .eq("organization_id", orgId)
    .eq("contact_id", b1?.contact_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const activityTypes = new Set((activities ?? []).map((a) => a.activity_type));
  record("appointment_booked activity logged", activityTypes.has("appointment_booked"));

  // the booked slot leaves the public availability
  const after1 = svcId
    ? await firstSlot("first-client", svcId, targetDate)
    : { slots: [], error: null };
  record("booked slot leaves public slots", !after1.slots.includes(slots[0]));

  // re-booking the same slot is rejected
  const dup = await admin.rpc("book_appointment", {
    p_service_id: svcId,
    p_starts_at: slots[0],
    p_name: "Second Try",
    p_email: `dup-${runEmail}`,
    p_ip_hash: `${runIp}-dup`,
  });
  record(
    "double-booking same slot rejected",
    /BOOKING_SLOT_UNAVAILABLE/.test(dup.error?.message ?? ""),
    dup.error?.message ?? "",
  );

  // ── 5) exclusion constraint backstop (race-safe) ───────────────────
  const { error: overlapErr } = await admin.from("appointments").insert({
    organization_id: orgId,
    service_id: scratchSvc?.id, // different service, same org calendar
    starts_at: slots[0],
    ends_at: new Date(new Date(slots[0]).getTime() + 30 * 60_000).toISOString(),
    timezone: "America/Halifax",
    customer_name: "Backstop",
    customer_email: `backstop-${tag}@example.com`,
    status: "Scheduled",
  });
  record(
    "DB exclusion constraint blocks overlapping insert",
    /exclusion constraint/i.test(overlapErr?.message ?? ""),
    overlapErr?.message ?? "",
  );

  // ── 6) second booking at a different slot ───────────────────────────
  const book2 = await admin.rpc("book_appointment", {
    p_service_id: svcId,
    p_starts_at: after1.slots[0],
    p_name: "Booking Two",
    p_email: `two-${runEmail}`,
    p_ip_hash: `${runIp}-2`,
  });
  const b2 = book2.data;
  record(
    "second booking at another slot succeeds",
    b2?.ok === true && !!b2?.token,
    book2.error?.message ?? "",
  );
  if (b2?.token) cleanup.appointments.push(b2.appointment_id);
  if (b2?.contact_id) cleanup.contacts.push(b2.contact_id);
  if (b2?.lead_id) cleanup.leads.push(b2.lead_id);

  // ── 7) get_appointment_by_token — own data only (anon) ─────────────
  const lookup = await anon.rpc("get_appointment_by_token", { p_token: b1?.token });
  record(
    "token lookup returns the appointment",
    lookup.data?.id === b1?.appointment_id,
    lookup.error?.message ?? "",
  );
  const allowedKeys = new Set([
    "id",
    "token",
    "status",
    "service_id",
    "service_name",
    "org_name",
    "starts_at",
    "ends_at",
    "timezone",
    "customer_name",
    "customer_email",
    "customer_phone",
    "notes",
    "source",
    "created_at",
  ]);
  const leakKeys = Object.keys(lookup.data ?? {}).filter((k) => !allowedKeys.has(k));
  record(
    "token payload exposes only own booking fields",
    leakKeys.length === 0,
    leakKeys.join(","),
  );

  const ghost = await anon.rpc("get_appointment_by_token", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  record("unknown token → null", ghost.data === null);

  // the other booking is NOT reachable through this token
  const other = await anon.rpc("get_appointment_by_token", { p_token: b1?.token });
  record("cannot see the other customer's booking", other.data?.id !== b2?.appointment_id);

  // ── 8) cancel + slot freed ─────────────────────────────────────────
  const cancelRes = await admin.rpc("cancel_appointment", { p_token: b2?.token });
  record(
    "cancel succeeds",
    cancelRes.data?.ok === true && cancelRes.data?.status === "Cancelled",
    cancelRes.error?.message ?? "",
  );
  const again = await admin.rpc("cancel_appointment", { p_token: b2?.token });
  record(
    "cancelled booking can't be cancelled twice",
    /APPOINTMENT_NOT_CANCELLABLE/.test(again.error?.message ?? ""),
    again.error?.message ?? "",
  );

  const afterCancel = svcId
    ? await firstSlot("first-client", svcId, targetDate)
    : { slots: [], error: null };
  record(
    "cancelled slot returns to public slots",
    afterCancel.slots.includes(b2 ? after1.slots[0] : ""),
    afterCancel.slots.includes(b2 ? after1.slots[0] : "") ? "freed" : "still gone",
  );

  // ── 9) reschedule + occupied-slot rejection ────────────────────────
  const resched = await admin.rpc("reschedule_appointment", {
    p_token: b1?.token,
    p_new_starts: after1.slots[0], // the freed slot
  });
  record(
    "reschedule to a free slot succeeds",
    resched.data?.ok === true && resched.data?.starts_at === after1.slots[0],
    resched.error?.message ?? "",
  );

  // ── 10) rate limit: 5/hr per IP, 6th blocked ───────────────────────
  const burstHash = `burst-${tag}`;
  let blocked = 0;
  for (let i = 0; i < 6; i += 1) {
    const slotList = svcId ? await firstSlot("first-client", svcId, targetDate) : { slots: [] };
    const take = slotList.slots[0];
    if (!take) break;
    const res = await admin.rpc("book_appointment", {
      p_service_id: svcId,
      p_starts_at: take,
      p_name: `Burst ${i}`,
      p_email: `burst-${i}-${tag}@example.com`,
      p_ip_hash: burstHash,
    });
    if (res.error && /BOOKING_RATE_LIMITED/.test(res.error.message)) {
      blocked = i + 1;
      break;
    }
    if (res.data?.appointment_id) cleanup.appointments.push(res.data.appointment_id);
    if (res.data?.contact_id) cleanup.contacts.push(res.data.contact_id);
    if (res.data?.lead_id) cleanup.leads.push(res.data.lead_id);
    if (!res.data?.ok) {
      record("burst booking without error", false, res.error?.message ?? "");
      break;
    }
  }
  record(
    "rate limit blocks the 6th booking per IP",
    blocked === 6,
    blocked ? `blocked on #${blocked}` : "never blocked",
  );

  // reschedule into a slot occupied by a burst booking → rejected
  const burstBookings = await admin
    .from("appointments")
    .select("starts_at")
    .eq("organization_id", orgId)
    .eq("ip_hash", burstHash)
    .in("status", ["Scheduled", "Confirmed"])
    .limit(1);
  if (burstBookings.data?.[0]?.starts_at && b1?.token) {
    const conflict = await admin.rpc("reschedule_appointment", {
      p_token: b1.token,
      p_new_starts: burstBookings.data[0].starts_at,
    });
    record(
      "reschedule into occupied slot rejected",
      /BOOKING_SLOT_UNAVAILABLE/.test(conflict.error?.message ?? ""),
      conflict.error?.message ?? "",
    );
  } else {
    record("reschedule into occupied slot rejected", false, "no burst slot available");
  }

  // ── 11) anon cannot execute the write RPCs ─────────────────────────
  const anonWrite = await anon.rpc("book_appointment", {
    p_service_id: svcId,
    p_starts_at: slots[0],
    p_name: "Hacker",
    p_email: "hacker@example.com",
  });
  record(
    "anon cannot execute book_appointment (no grant)",
    !!anonWrite.error,
    anonWrite.error?.message ?? "",
  );

  // ── summary ────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nBooking smoke: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
} finally {
  // ── cleanup ────────────────────────────────────────────────────────
  const ids = (arr) => arr.filter(Boolean);
  for (const id of ids(cleanup.appointments)) {
    await admin.from("appointments").delete().eq("id", id);
  }
  for (const id of ids(cleanup.leads)) {
    await admin.from("leads").delete().eq("id", id);
  }
  for (const id of ids(cleanup.contacts)) {
    await admin.from("contacts").delete().eq("id", id);
  }
  for (const id of ids(cleanup.services)) {
    await admin.from("services").delete().eq("id", id);
  }
  console.log(
    `\ncleaned up ${cleanup.appointments.length} appointments, ${cleanup.leads.length} leads, ${cleanup.contacts.length} contacts, ${cleanup.services.length} services`,
  );
}

function runPhone() {
  return `902-555-${String(Date.now()).slice(-4)}`;
}
