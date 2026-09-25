#!/usr/bin/env node
/**
 * Live check for the fixed resource upload path (files go browser → storage
 * directly; the server action only records metadata, so no 1 MB Server Action
 * body limit):
 *   - owner/admin session can upload into its own org's `orgs/<orgId>/` prefix
 *     (private resources bucket RLS) and list the object
 *   - anon (no session) upload is denied
 *   - a non-member cannot upload
 *   - GET /dashboard/resources/new renders for an owner/admin member
 *
 * Uses a throwaway user + scratch org, fully cleaned up afterwards.
 * Run: node scripts/check-upload.mjs  (needs `npm run dev` on :3001)
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
const appUrl = "http://localhost:3001";

if (!url || !anonKey || !serviceKey) {
  console.log("SKIP  Upload check — Supabase env not fully configured.");
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
const email = `up-${tag}@example.com`;
const password = "TemporaryPass123!";
let userId = null;
let orgId = null;
let sessionUser = null;
let objectPath = null;

try {
  // Scratch org + owner/admin member
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: `Upload Check ${tag}`, slug: `upload-check-${tag}` })
    .select("id")
    .single();
  if (orgErr) throw new Error(`org insert: ${orgErr.message}`);
  orgId = org.id;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(`createUser: ${createErr.message}`);
  userId = created.user.id;

  // M1 auto-joins new signups to the default org (first-client) as `staff` —
  // drop it so the scratch org is this user's *first* membership (getMyOrg
  // returns the earliest membership).
  await admin.from("organization_members").delete().eq("user_id", userId);

  const { error: memberErr } = await admin.from("organization_members").insert({
    organization_id: orgId,
    user_id: userId,
    role: "admin",
  });
  if (memberErr) throw new Error(`member insert: ${memberErr.message}`);

  // Session
  const pw = await anon.auth.signInWithPassword({ email, password });
  let session = pw.data.session;
  if (!session) {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const otp = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data?.properties?.hashed_token,
      email,
    });
    session = otp.data?.session ?? null;
  }
  if (!session) throw new Error("could not mint a session");

  sessionUser = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: setErr } = await sessionUser.auth.setSession(session);
  if (setErr) throw new Error(`setSession: ${setErr.message}`);

  // Owner/admin upload into own org prefix → allowed
  objectPath = `orgs/${orgId}/smoke-${tag}.txt`;
  const { error: upErr } = await sessionUser.storage
    .from("resources")
    .upload(objectPath, new Blob(["hello from the upload check"], { type: "text/plain" }), {
      contentType: "text/plain",
      upsert: false,
    });
  record("owner/admin uploads into own org prefix", !upErr, upErr?.message ?? "");

  // Member read → object visible via list
  const { data: listing } = await sessionUser.storage.from("resources").list(`orgs/${orgId}`, {
    limit: 1000,
    search: `smoke-${tag}`,
  });
  record(
    "uploaded object listed by member session",
    (listing ?? []).some((o) => o.name === `smoke-${tag}.txt`),
  );

  // Wrong-org path → denied (cannot write outside own org)
  const { error: wrongErr } = await sessionUser.storage
    .from("resources")
    .upload(
      `orgs/00000000-0000-0000-0000-000000000000/sneak-${tag}.txt`,
      new Blob(["nope"], { type: "text/plain" }),
      { contentType: "text/plain", upsert: false },
    );
  record("upload into another org's prefix denied", !!wrongErr, wrongErr?.message ?? "");

  // Non-member (no org) upload → denied
  const stranger = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: strangerUser } = await admin.auth.admin.createUser({
    email: `stranger-${tag}@example.com`,
    password,
    email_confirm: true,
  });
  const strangerPw = await anon.auth.signInWithPassword({
    email: `stranger-${tag}@example.com`,
    password,
  });
  let strangerSession = strangerPw.data.session;
  if (!strangerSession) {
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: `stranger-${tag}@example.com`,
    });
    const otp = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data?.properties?.hashed_token,
      email: `stranger-${tag}@example.com`,
    });
    strangerSession = otp.data?.session ?? null;
  }
  await stranger.auth.setSession(strangerSession);
  const { error: strangerErr } = await stranger.storage
    .from("resources")
    .upload(`orgs/${orgId}/stranger-${tag}.txt`, new Blob(["nope"], { type: "text/plain" }), {
      contentType: "text/plain",
      upsert: false,
    });
  record("non-member upload denied", !!strangerErr, strangerErr?.message ?? "");
  if (strangerUser?.user?.id) {
    await admin.from("organization_members").delete().eq("user_id", strangerUser.user.id);
    await admin.auth.admin.deleteUser(strangerUser.user.id);
  }

  // Anon (no session) upload → denied
  const { error: anonErr } = await anon.storage
    .from("resources")
    .upload(`orgs/${orgId}/anon-${tag}.txt`, new Blob(["nope"], { type: "text/plain" }), {
      contentType: "text/plain",
      upsert: false,
    });
  record("anon upload denied", !!anonErr, anonErr?.message ?? "");

  // Render check: /dashboard/resources/new for the admin member
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: "bearer",
    }),
  );
  const res = await fetch(appUrl + "/dashboard/resources/new", {
    redirect: "manual",
    headers: { cookie: `sb-praegspjcewnzkcocmsj-auth-token=${cookieValue}`, "user-agent": "smoke" },
  });
  const html = await res.text();
  record(
    "GET /dashboard/resources/new (owner/admin) → 200",
    res.status === 200,
    `status=${res.status}`,
  );
  record(
    "new-resource form renders file input + title field",
    html.includes('type="file"') &&
      html.includes('name="title"') &&
      !html.includes("Body exceeded"),
    res.status === 200 ? "" : "page didn't render",
  );
} catch (err) {
  record("upload check executed cleanly", false, err.message);
} finally {
  try {
    if (sessionUser && objectPath) {
      await sessionUser.storage.from("resources").remove([objectPath]);
    }
  } catch {
    // keep going
  }
  try {
    if (userId) await admin.from("organization_members").delete().eq("user_id", userId);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch {
    // keep going
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length > 0 ? 1 : 0;
