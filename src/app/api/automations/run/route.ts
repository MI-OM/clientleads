import { NextResponse, type NextRequest } from "next/server";
import { enqueueDueAppointmentReminders, processDueAutomationActions } from "@/lib/automations/run";

export const dynamic = "force-dynamic";

/**
 * Automation queue drainer — Vercel cron (see vercel.json), gated the same
 * way as /api/campaigns/schedule. Executes due send_email / notify /
 * delayed automation steps that SQL triggers queued.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const queuedReminders = await enqueueDueAppointmentReminders();
  const result = await processDueAutomationActions();
  return NextResponse.json({ ...result, queuedReminders });
}
