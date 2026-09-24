import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeCampaignEvent,
  verifyResendWebhookSignature,
  verifyWebhookSignature,
} from "@/lib/email/campaign";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resend webhook receiver (PRD §28).
 *
 * Security: every request must carry `x-cl-signature` = hex
 * HMAC-SHA256(RESEND_WEBHOOK_SECRET, raw body). When the secret env var is
 * not set the route refuses everything (503) — webhooks simply can't be
 * forged or accidentally honored before configuration. Payloads are then
 * correlated (recipient_id → provider_message_id → contact email) and handed
 * to the service-role `process_campaign_event` RPC, which is idempotent and
 * recomputes counters from the recipient rows on every event.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  const legacySignature = request.headers.get("x-cl-signature") ?? "";
  const validLegacy = verifyWebhookSignature(secret, raw, legacySignature);
  const validResend = verifyResendWebhookSignature(
    secret,
    raw,
    request.headers.get("svix-id") ?? "",
    request.headers.get("svix-timestamp") ?? "",
    request.headers.get("svix-signature") ?? "",
  );
  if (!validLegacy && !validResend) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const p = (payload ?? {}) as Record<string, unknown>;
  const event = normalizeCampaignEvent(typeof p.type === "string" ? p.type : "");
  if (!["delivered", "bounced", "opened", "clicked", "unsubscribe"].includes(event)) {
    // Ack unknown event types so the provider doesn't retry forever.
    return NextResponse.json({ ok: true, processed: false, reason: "ignored_event" });
  }

  const data = (typeof p.data === "object" && p.data !== null ? p.data : {}) as Record<
    string,
    unknown
  >;
  const occurredAt =
    typeof p.created_at === "string" && p.created_at ? p.created_at : new Date().toISOString();

  const admin = createAdminClient();

  let match: { id: string; campaign_id: string } | null = null;

  // 1) explicit recipient id (also verifies the row exists)
  if (typeof data.recipient_id === "string" && UUID_RE.test(data.recipient_id)) {
    const { data: row } = await admin
      .from("campaign_recipients")
      .select("id, campaign_id")
      .eq("id", data.recipient_id)
      .maybeSingle();
    if (row?.id) match = { id: String(row.id), campaign_id: String(row.campaign_id) };
  }

  // 2) provider message id (what the send loop records from the Resend response)
  const providerMessageId =
    typeof data.email_id === "string" && data.email_id
      ? data.email_id
      : typeof data.id === "string" && data.id
        ? data.id
        : null;
  if (!match && providerMessageId) {
    const { data: row } = await admin
      .from("campaign_recipients")
      .select("id, campaign_id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    if (row?.id) match = { id: String(row.id), campaign_id: String(row.campaign_id) };
  }

  // 3) contact email + campaign id (Resend data.to / our own correlation)
  if (!match && typeof data.email === "string" && data.email) {
    const campaignId =
      typeof data.campaign_id === "string" && UUID_RE.test(data.campaign_id)
        ? data.campaign_id
        : null;
    if (campaignId) {
      const { data: row } = await admin
        .from("campaign_recipients")
        .select("id, campaign_id")
        .eq("campaign_id", campaignId)
        .eq("contact.email", data.email)
        .maybeSingle();
      if (row?.id) match = { id: String(row.id), campaign_id: String(row.campaign_id) };
    }
  }

  if (!match) {
    return NextResponse.json({ ok: true, processed: false, reason: "unmatched_recipient" });
  }

  const { data: rpcData, error } = await admin.rpc("process_campaign_event", {
    p_recipient_id: match.id,
    p_campaign_id: match.campaign_id,
    p_event: event,
    p_occurred_at: occurredAt,
  });

  if (error) {
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, processed: true, ...(rpcData ?? {}) });
}
