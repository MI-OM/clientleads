#!/usr/bin/env node
/**
 * RLS isolation check — verifies the core M1 guarantee:
 *   "a user can only access records of an organization they belong to"
 *
 * Flow: creates two throwaway users + two orgs, assigns each user to one
 * org, then asserts neither can read or mutate the other's data.
 * All test data is cleaned up afterwards.
 *
 * Requires (in the environment): NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * If they are missing (e.g. CI before Supabase is wired up) the script
 * reports a skip and exits 0.
 *
 * Run: npm run test:rls
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.log("SKIP  RLS check — Supabase env not configured yet (M1 prerequisite).");
  process.exit(0);
}

const password = "rls-check-123456X!";
const tag = Date.now().toString(36);
const emailA = `rls-a-${tag}@example.com`;
const emailB = `rls-b-${tag}@example.com`;

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

let userA = null;
let userB = null;
let orgA = null;
let orgB = null;

try {
  // ── Setup: users (signup trigger auto-joins them to the default org; that
  //    extra membership is fine — it must not leak the other org either) ──
  const a = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  const b = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });
  userA = a.data.user;
  userB = b.data.user;

  if (!userA || !userB) throw new Error(`Failed to create test users: ${a.error?.message ?? b.error?.message}`);

  // ── Setup: two orgs + memberships (service role bypasses RLS) ──
  const orgARes = await admin
    .from("organizations")
    .insert({ name: `RLS Test A ${tag}`, slug: `rls-a-${tag}` })
    .select("id, name")
    .single();
  const orgBRes = await admin
    .from("organizations")
    .insert({ name: `RLS Test B ${tag}`, slug: `rls-b-${tag}` })
    .select("id, name")
    .single();
  if (orgARes.error || orgBRes.error) throw new Error(`Org creation failed: ${orgARes.error?.message ?? orgBRes.error?.message}`);
  orgA = orgARes.data;
  orgB = orgBRes.data;

  await admin.from("organization_members").insert({ organization_id: orgA.id, user_id: userA.id, role: "admin" });
  await admin.from("organization_members").insert({ organization_id: orgB.id, user_id: userB.id, role: "admin" });

  // ── Authenticate as each user ──
  const sessionA = await anon.auth.signInWithPassword({ email: emailA, password });
  const sessionB = await anon.auth.signInWithPassword({ email: emailB, password });
  if (sessionA.error || sessionB.error) throw new Error("Test sign-in failed");

  const clientA = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const clientB = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await clientA.auth.setSession(sessionA.data.session);
  await clientB.auth.setSession(sessionB.data.session);

  // ── Assertions ──
  const orgsA = await clientA.from("organizations").select("id").eq("id", orgA.id);
  const orgsFromBAsA = await clientA.from("organizations").select("id").eq("id", orgB.id);
  record("A reads its own org", !orgsA.error && orgsA.data.length === 1);
  record("A cannot read B's org", !orgsFromBAsA.error && orgsFromBAsA.data.length === 0);

  const updateB = await clientA.from("organizations").update({ name: "Hacked" }).eq("id", orgB.id);
  record("A cannot update B's org", !!updateB.error);

  const membersA = await clientA
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userA.id);
  record(
    "A sees only own memberships",
    !membersA.error && membersA.data.every((m) => m.organization_id === orgA.id),
  );

  // B as the mirror check
  const orgsAAsB = await clientB.from("organizations").select("id").eq("id", orgA.id);
  record("B cannot read A's org", !orgsAAsB.error && orgsAAsB.data.length === 0);

  const membersOfA = await clientB
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", orgA.id);
  record("B cannot read A's members", !membersOfA.error && membersOfA.data.length === 0);
} catch (err) {
  record("test executed without errors", false, err.message);
} finally {
  // ── Cleanup ──
  if (userA) await admin.auth.admin.deleteUser(userA.id);
  if (userB) await admin.auth.admin.deleteUser(userB.id);
  if (orgA) await admin.from("organizations").delete().eq("id", orgA.id);
  if (orgB) await admin.from("organizations").delete().eq("id", orgB.id);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);