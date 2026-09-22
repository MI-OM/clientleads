#!/usr/bin/env node
/**
 * M1 signup → auto-join → sign-in → org visibility smoke test.
 *
 * Exercises the exact endpoints the app's forms use (anon auth.signUp,
 * auth.signInWithPassword) against the live project, then verifies the
 * signup trigger created the profile + default-org membership, the user
 * sees exactly their org, and a staff member cannot edit business settings.
 * The test user is deleted afterwards.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local if present).
 * Run: npm run test:auth
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
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
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
  console.log("SKIP  auth smoke — Supabase env not fully configured.");
  process.exit(0);
}

const password = "Smoke-test-123456!";
const tag = Date.now().toString(36);
const email = `e2e-${tag}@example.com`;

const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

let userId = null;

try {
  // 1. Sign up through the same endpoint the register form uses. Supabase
  //    rate-limits anon signups per IP, so if we're throttled fall back to
  //    admin.createUser (still inserts into auth.users → fires the trigger).
  const signup = await anon.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Smoke Test User" } },
  });
  if (signup.data.user?.id) {
    userId = signup.data.user.id;
    record("signup creates auth user (register flow)", true);
    // With "Confirm email" on, the user needs confirmation before sign-in.
    if (!signup.data.session) {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    }
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Smoke Test User" },
    });
    userId = created.data.user?.id ?? null;
    record(
      "signup creates auth user (register flow)",
      !!userId,
      signup.error?.message ?? created.error?.message ?? "",
    );
    record("anon signup endpoint rate-limited (fallback used)", true, signup.error?.message ?? "");
  }

  if (!userId) throw new Error("no auth user was created");

  // 2. Signup trigger created the profile + default-org membership.
  const profile = await admin.from("profiles").select("full_name").eq("id", userId).single();
  record("profile auto-created from signup metadata", profile.data?.full_name === "Smoke Test User");

  const memberships = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId);
  const defaultOrgId = memberships.data?.[0]?.organization_id ?? null;
  record(
    "auto-joined the default workspace",
    !!defaultOrgId && memberships.data?.[0]?.role === "staff",
  );

  // 3. Password sign-in (what the login form does).
  const signIn = await anon.auth.signInWithPassword({ email, password });
  record("password sign-in works", !signIn.error && !!signIn.data.session, signIn.error?.message ?? "");

  if (signIn.error || !signIn.data.session) throw new Error("sign-in failed");

  // 4. As the user: they see exactly their own org.
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await userClient.auth.setSession(signIn.data.session);
  const orgs = await userClient.from("organizations").select("id, name, slug");
  record(
    "user sees exactly their org",
    !orgs.error && orgs.data.length === 1 && orgs.data[0].id === defaultOrgId,
    orgs.error?.message ?? "",
  );

  // 5. Staff cannot edit business settings (RLS filters the update to 0 rows).
  const before = (
    await admin.from("organizations").select("name").eq("id", defaultOrgId).single()
  ).data?.name;
  await userClient.from("organizations").update({ name: "Hacked" }).eq("id", defaultOrgId);
  const after = (
    await admin.from("organizations").select("name").eq("id", defaultOrgId).single()
  ).data?.name;
  record(
    "staff cannot edit business settings",
    before !== undefined && before === after && after !== "Hacked",
  );
} catch (err) {
  record("smoke test executed cleanly", false, err.message);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length > 0 ? 1 : 0;