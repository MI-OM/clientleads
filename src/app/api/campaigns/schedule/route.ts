import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCampaign } from "@/lib/email/campaign";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, organization_id, scheduled_for, organization:organizations(slug)")
    .eq("status", "Scheduled")
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const results = [];
  for (const campaign of campaigns ?? []) {
    const organization = campaign.organization as { slug?: string } | null;
    const slug = organization?.slug;
    if (!slug) {
      results.push({ id: campaign.id, ok: false, error: "ORGANIZATION_NOT_FOUND" });
      continue;
    }

    const result = await sendCampaign(admin, campaign.id, slug);
    results.push({
      id: campaign.id,
      ok: result.ok,
      recipientCount: result.recipientCount,
      sentCount: result.sentCount,
      error: result.error,
    });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
