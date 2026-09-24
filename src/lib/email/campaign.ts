/**
 * M5 campaign email delivery (PRD §27–29) on top of Resend (REST, no SDK).
 *
 * Safety valve mirrors `src/lib/email/send.ts`: if `RESEND_API_KEY` isn't set
 * the send loop is a logged no-op and recipients are still marked Sent, so
 * the whole flow works (and the smoke passes) before a key exists.
 *
 * Webhook signature scheme (shared with the smoke and the webhook route):
 *   header `x-cl-signature` = hex HMAC-SHA256(RESEND_WEBHOOK_SECRET, raw body)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { baseUrl } from "@/lib/email/send";
import { sanitizeRichHtml, type TemplateSection } from "@/lib/campaigns/template-sections";

export { TEMPLATE_VARIABLES } from "@/lib/campaigns/constants";

const RESEND_API = "https://api.resend.com/emails";

/* ── template rendering ──────────────────────────────────────────────── */

const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Derive the sorted, de-duplicated {{var}} names referenced by a body.
 * Used by the templates CRUD to keep `email_templates.variables` accurate.
 */
export function deriveTemplateVariables(body: string): string[] {
  const vars = new Set<string>();
  for (const match of body.matchAll(VARIABLE_RE)) {
    vars.add(match[1]);
  }
  return [...vars].sort();
}

/**
 * Replace known {{vars}} with per-recipient values. Unknown vars are left
 * untouched so template authors can spot an unfilled placeholder. Whitespace
 * inside the braces is tolerated ({{ first_name }} works).
 */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\\n/g, "\n").replace(VARIABLE_RE, (_whole, name: string) => {
    const value = vars[name];
    return typeof value === "string" ? value : _whole;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/** Render visual template blocks into email-safe HTML. */
export function renderTemplateSectionsHtml(
  sections: TemplateSection[],
  imageUrl: string | null,
  vars: Record<string, string | undefined>,
  bodyBackgroundColor: string | null = null,
  footer: CampaignFooter = {},
): string {
  const blocks = sections
    .map((section) => {
      const title = section.title
        ? `<h1 style="margin:0 0 12px;font-size:30px;line-height:1.15">${escapeHtml(renderTemplate(section.title, vars))}</h1>`
        : "";
      const body = section.bodyHtml
        ? `<div style="margin:0;line-height:1.7;color:#57534e">${sanitizeRichHtml(renderTemplate(section.bodyHtml, vars))}</div>`
        : section.body
          ? `<p style="margin:0;line-height:1.7;color:#57534e;white-space:pre-line">${escapeHtml(renderTemplate(section.body, vars))}</p>`
          : "";
      if (section.type === "divider")
        return `<hr style="border:0;border-top:1px solid #e7e5e4;margin:28px 0">`;
      if (section.type === "image" && section.imageUrl)
        return `<img src="${escapeHtml(renderTemplate(section.imageUrl, vars))}" alt="${escapeHtml(section.imageAlt ?? "")}" style="display:block;width:100%;height:auto;border-radius:12px;margin:0 0 24px">`;
      if (section.type === "button" && section.buttonUrl)
        return `<p style="margin:24px 0"><a href="${escapeHtml(renderTemplate(section.buttonUrl, vars))}" style="display:inline-block;background:#14532d;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">${escapeHtml(section.buttonLabel ?? "Learn more")}</a></p>`;
      if (section.type === "footer")
        return `<footer style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e7e5e4;text-align:center;color:#78716c;font-size:12px">${body || `<p style="margin:0">${escapeHtml(renderTemplate(section.body ?? "", vars))}</p>`}</footer>`;
      const background = /^#[0-9a-f]{6}$/i.test(section.backgroundColor ?? "")
        ? `background:${section.backgroundColor};padding:20px;border-radius:8px;`
        : "";
      return `<section style="${background}margin:0 0 24px">${section.eyebrow ? `<p style="margin:0 0 8px;color:#14532d;text-transform:uppercase;font-size:12px;letter-spacing:1px">${escapeHtml(renderTemplate(section.eyebrow, vars))}</p>` : ""}${title}${body}</section>`;
    })
    .join("");
  const header = imageUrl
    ? `<img src="${escapeHtml(renderTemplate(imageUrl, vars))}" alt="" style="display:block;width:100%;height:auto;border-radius:12px;margin:0 0 28px">`
    : "";
  const background = /^#[0-9a-f]{6}$/i.test(bodyBackgroundColor ?? "")
    ? bodyBackgroundColor
    : "#ffffff";
  return `<div style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;line-height:1.6;background:${background}">${header}${blocks}${renderCampaignFooter(footer)}</div>`;
}

export interface CampaignFooter {
  businessName?: string | null;
  address?: Array<string | null | undefined>;
  unsubscribeUrl?: string | null;
  appUrl?: string | null;
}

function renderCampaignFooter(footer: CampaignFooter): string {
  const address = (footer.address ?? []).filter((part): part is string => Boolean(part?.trim()));
  const businessName = footer.businessName?.trim() || "Your Business";
  const unsubscribeUrl = footer.unsubscribeUrl?.trim() || "#";
  const appUrl = footer.appUrl?.trim() || baseUrl();
  return `<footer style="margin:32px 0 0;padding-top:18px;border-top:1px solid #e7e5e4;text-align:center;color:#78716c;font-size:12px"><p style="margin:0 0 6px;font-weight:600">${escapeHtml(businessName)}</p>${address.length ? `<p style="margin:0 0 8px">${address.map(escapeHtml).join(", ")}</p>` : ""}<p style="margin:0"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#57534e;text-decoration:underline">Unsubscribe</a><span style="padding:0 6px">·</span><a href="${escapeHtml(appUrl)}" style="color:#57534e;text-decoration:underline">ClientLeads</a></p></footer>`;
}

/* ── unsubscribe URLs (PRD §68) ──────────────────────────────────────── */

export function buildUnsubscribeUrl(slug: string, token: string): string {
  return `${baseUrl()}/${slug}/unsubscribe/${token}`;
}

/* ── webhook signature (shared with route + smoke) ───────────────────── */

export function webhookSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(webhookSignature(secret, body), "utf8");
  const received = Buffer.from(signature.trim(), "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Verify the Svix signature sent by Resend webhooks. */
export function verifyResendWebhookSignature(
  secret: string,
  body: string,
  webhookId: string,
  timestamp: string,
  signatures: string,
): boolean {
  if (!secret || !webhookId || !timestamp || !signatures) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const signingSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(signingSecret, "base64");
  } catch {
    return false;
  }
  const signedContent = `${webhookId}.${timestamp}.${body}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");
  return signatures.split(" ").some((signature) => {
    const [, value] = signature.split(",", 2);
    return value === expected;
  });
}

/**
 * Normalize a provider event name to the RPC's vocabulary:
 * strips the `email.` prefix and folds `unsubscribed` → `unsubscribe`.
 * Unknown values pass through and are rejected (harmlessly) by the RPC.
 */
export function normalizeCampaignEvent(event: string): string {
  const e = event.trim().toLowerCase();
  if (e.startsWith("email.")) return e.slice("email.".length);
  if (e === "unsubscribed") return "unsubscribe";
  return e;
}

/* ── delivery ────────────────────────────────────────────────────────── */

export interface CampaignSendResult {
  ok: boolean;
  error?: string;
  recipientCount: number;
  sentCount: number;
}

/**
 * Send one campaign (PRD §27):
 *   1. `resolve_campaign_recipients` — audience resolution flips Draft/Scheduled
 *      → Sending and materializes the recipient set (unsubscribed excluded).
 *   2. Per-recipient Resend POST (best-effort, never throws for one failure),
 *      collecting provider message ids for webhook correlation, plus the
 *      `List-Unsubscribe` header built from the recipient's uuid token.
 *   3. `mark_campaign_recipients_sent` → Sent + records provider ids.
 *
 * Without RESEND_API_KEY step 2 is a logged no-op and everyone is marked Sent.
 */
export async function sendCampaign(
  admin: SupabaseClient,
  campaignId: string,
  slug: string,
): Promise<CampaignSendResult> {
  const empty = (recipientCount = 0): CampaignSendResult => ({
    ok: false,
    recipientCount,
    sentCount: 0,
  });

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) {
    return { ...empty(), error: "CAMPAIGN_NOT_FOUND" };
  }

  const resolveRes = await admin.rpc("resolve_campaign_recipients", {
    p_campaign_id: campaignId,
  });
  if (resolveRes.error || !resolveRes.data?.ok) {
    return { ...empty(), error: resolveRes.error?.message ?? "CAMPAIGN_NOT_SENDABLE" };
  }
  const recipientCount = Number(resolveRes.data.recipient_count ?? 0);

  const { data: org } = await admin
    .from("organizations")
    .select("name, address, city, province, country, postal_code")
    .eq("id", campaign.organization_id)
    .maybeSingle();
  const orgName = org?.name ?? slug;

  const { data: recipients } = await admin
    .from("campaign_recipients")
    .select("id, token, contact:contacts(email, first_name)")
    .eq("campaign_id", campaignId)
    .eq("status", "Queued");

  const key = process.env.RESEND_API_KEY;
  const providerIds: Record<string, string> = {};

  if (!key) {
    console.info(
      `[campaign] RESEND_API_KEY not set — marking ${recipientCount} recipients sent (no-op)`,
    );
  } else {
    const from = `${campaign.sender_name} <${campaign.sender_email}>`;
    for (const row of recipients ?? []) {
      const contact = row.contact as { email?: string | null; first_name?: string } | null;
      const email = contact?.email;
      if (typeof email !== "string" || !email.trim()) continue;

      const vars: Record<string, string> = {
        first_name: contact?.first_name ?? "",
        business_name: orgName,
        unsubscribe_url: buildUnsubscribeUrl(slug, row.token as string),
      };
      const subject = renderTemplate(String(campaign.subject), vars);
      const text = renderTemplate(String(campaign.content), vars);
      const html = campaign.sections?.length
        ? renderTemplateSectionsHtml(
            campaign.sections,
            campaign.image_url,
            vars,
            campaign.body_background_color,
            {
              businessName: orgName,
              address: [
                org?.address,
                org?.city,
                org?.province,
                org?.country,
                org?.postal_code,
              ],
              unsubscribeUrl: vars.unsubscribe_url,
            },
          )
        : `<div style="font-family:system-ui,sans-serif;line-height:1.6">${escapeHtml(text)}${renderCampaignFooter({
            businessName: orgName,
            address: [org?.address, org?.city, org?.province, org?.country, org?.postal_code],
            unsubscribeUrl: vars.unsubscribe_url,
          })}</div>`;

      try {
        const res = await fetch(RESEND_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: email.trim(),
            subject,
            text,
            html,
            headers: { "List-Unsubscribe": `<${vars.unsubscribe_url}>` },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          const providerId = payload?.id;
          if (typeof providerId === "string" && providerId)
            providerIds[String(row.id)] = providerId;
        } else {
          console.warn(`[campaign] Resend ${res.status} for ${email}: ${await res.text()}`);
        }
      } catch (err) {
        console.warn(`[campaign] send failed for ${email}:`, err);
      }
    }
  }

  const mark = await admin.rpc("mark_campaign_recipients_sent", {
    p_campaign_id: campaignId,
    p_provider_ids: providerIds,
  });
  if (mark.error || !mark.data?.ok) {
    return {
      ...empty(recipientCount),
      error: mark.error?.message ?? "CAMPAIGN_NOT_SENDING",
      sentCount: Object.keys(providerIds).length,
    };
  }

  return { ok: true, recipientCount, sentCount: Object.keys(providerIds).length };
}

export { RESEND_API };
