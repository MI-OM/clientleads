#!/usr/bin/env node
/**
 * M3 page-level render check against the running Next dev server.
 *
 * Verifies the public business page and the dashboard modules render for
 * real (not just that the DB/RPC layer works):
 *   - /first-client  → 200, branded org + seeded "Contact us" form
 *   - unknown slug   → 404
 *   - /dashboard*    → unauthenticated redirect to /login (no leaks)
 *   - /dashboard{,/services,/forms,/resources} with a live session →
 *     200 + expected headings, and the app shell links Services/Forms/
 *     Resources
 *
 * Session is minted via the service role (admin.createUser), with the anon
 * password flow as primary and a magic-link verify as fallback (anon
 * password sign-in can be IP rate-limited in this project).
 *
 * Run: node scripts/check-pages.mjs   (needs `npm run dev` on :3001)
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
  console.log("SKIP  Page check — Supabase env not fully configured.");
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
const email = `dash-${tag}@example.com`;
const password = "TemporaryPass123!";
let userId = null;
let session = null;

try {
  // Session minting
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(`createUser: ${createErr.message}`);
  userId = created.user.id;

  const pw = await anon.auth.signInWithPassword({ email, password });
  if (pw.error) {
    // Fall back to a magic-link verify (admin.generateLink is not rate-limited)
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hashed = link.data?.properties?.hashed_token;
    const otp = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hashed, email });
    session = otp.data?.session ?? null;
    if (otp.error) throw new Error(`verifyOtp: ${otp.error.message}`);
  } else {
    session = pw.data.session;
  }
  if (!session) throw new Error("could not mint a session");
  record("session minted for render check", true);

  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: "bearer",
    }),
  );
  const cookie = `sb-praegspjcewnzkcocmsj-auth-token=${cookieValue}`;

  const get = async (path, withCookie = false) => {
    const res = await fetch(appUrl + path, {
      redirect: "manual",
      headers: withCookie ? { cookie, "user-agent": "smoke" } : { "user-agent": "smoke" },
    });
    return {
      status: res.status,
      location: res.headers.get("location") ?? "",
      text: await res.text(),
    };
  };

  // Public business page
  const pub = await get("/first-client");
  record("GET /first-client → 200", pub.status === 200, `status=${pub.status}`);
  record("public page shows branded org name", pub.text.includes("First Client Real Estate"));
  record("public page renders Contact us form", pub.text.includes("Contact us"));

  const missing = await get("/no-such-business-xyz");
  record("unknown slug → 404", missing.status === 404, `status=${missing.status}`);

  // Auth guard
  const guarded = await get("/dashboard");
  record(
    "unauthenticated /dashboard redirects to /login",
    guarded.status >= 300 && guarded.status < 400 && guarded.location.includes("/login"),
    `status=${guarded.status} location=${guarded.location || "(none)"}`,
  );

  // Authenticated dashboard renders
  const dash = await get("/dashboard", true);
  record("GET /dashboard (session) → 200", dash.status === 200, `status=${dash.status}`);
  record(
    "dashboard shell renders sidebar Services link",
    dash.text.includes('href="/dashboard/services"'),
  );
  record(
    "dashboard shell renders sidebar Forms link",
    dash.text.includes('href="/dashboard/forms"'),
  );
  record(
    "dashboard shell renders sidebar Resources link",
    dash.text.includes('href="/dashboard/resources"'),
  );

  const services = await get("/dashboard/services", true);
  record("GET /dashboard/services → 200", services.status === 200, `status=${services.status}`);
  record("/dashboard/services shows the Services module", services.text.includes("Services"));

  const forms = await get("/dashboard/forms", true);
  record("GET /dashboard/forms → 200", forms.status === 200, `status=${forms.status}`);
  record("/dashboard/forms shows the Forms module", forms.text.includes("Forms"));

  const resources = await get("/dashboard/resources", true);
  record("GET /dashboard/resources → 200", resources.status === 200, `status=${resources.status}`);
  record("/dashboard/resources shows the Resources module", resources.text.includes("Resources"));
} catch (err) {
  record("page checks executed cleanly", false, err.message);
} finally {
  try {
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch {
    // keep going
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length > 0 ? 1 : 0;
