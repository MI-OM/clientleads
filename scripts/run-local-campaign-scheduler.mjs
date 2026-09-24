#!/usr/bin/env node
/**
 * Opt-in local equivalent of the Vercel campaign cron.
 *
 * Start `npm run dev` first, then run `npm run dev:campaign-scheduler` in a
 * second terminal. This intentionally runs outside `next dev` so it cannot
 * accidentally send campaigns just by starting the application.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadLocalEnv() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "..", ".env.local"), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith("#")) continue;
      const delimiter = value.indexOf("=");
      if (delimiter < 0) continue;
      const key = value.slice(0, delimiter).trim();
      const envValue = value
        .slice(delimiter + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = envValue;
    }
  } catch {
    // The explicit validation below gives a useful error when .env.local is absent.
  }
}

loadLocalEnv();

const secret = process.env.CRON_SECRET;
const baseUrl = (process.env.LOCAL_SCHEDULER_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const configuredInterval = Number(process.env.LOCAL_SCHEDULER_INTERVAL_MS ?? 15_000);
const intervalMs = Number.isFinite(configuredInterval)
  ? Math.max(5_000, configuredInterval)
  : 15_000;

if (!secret) {
  console.error("Missing CRON_SECRET in .env.local; the local scheduler will not start.");
  process.exit(1);
}

const endpoint = `${baseUrl}/api/campaigns/schedule`;
let running = false;

async function runOnce() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` } });
    const body = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${body.slice(0, 300)}`);
    const result = JSON.parse(body);
    console.info(`[campaign-scheduler] processed ${result.processed ?? 0} due campaign(s)`);
  } catch (error) {
    console.error(
      `[campaign-scheduler] ${endpoint} failed:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    running = false;
  }
}

console.info(
  `[campaign-scheduler] polling ${endpoint} every ${intervalMs / 1000}s; press Ctrl+C to stop.`,
);
await runOnce();
setInterval(runOnce, intervalMs);
