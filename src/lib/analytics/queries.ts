import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { countOverdueTasks, countPendingTasks } from "@/lib/tasks/queries";

/**
 * M6 analytics (PRD §33). Four metric families come from M2/M4 tables;
 * the campaign numbers come from the M5 migration
 * (`campaigns` / `campaign_recipients`), which may not be applied yet.
 *
 * Campaign queries are therefore DEFENSIVE: minimal local row types (we
 * deliberately do NOT import M5's modules), each wrapped in try/catch.
 * When the tables don't exist yet the values come back null and the page
 * renders "—"; once M5 lands (both migrations are pasted together) the
 * same queries resolve against the live schema.
 *
 * NOTE for the integrator: the guessed M5 recipient columns are
 * `opened_at` / `clicked_at` on campaign_recipients — adjust the column
 * names here once M5's real schema is known.
 */

/** Minimal defensive row type — NOT M5's module, just our own snapshot. */
interface CampaignRow {
  id: string;
  status?: string | null;
  sent_at?: string | null;
}

/** Minimal defensive row type for the recipients table. */
interface CampaignRecipientRow {
  id: string;
}

export interface AnalyticsMetrics {
  totalContacts: number;
  newContacts30d: number;
  openLeads: number;
  upcomingAppointments: number;
  completedAppointments30d: number;
  pendingTasks: number;
  overdueTasks: number;
  /** null until the M5 tables exist (defensive). */
  campaignsSent: number | null;
  campaignRecipients: number | null;
  campaignOpened: number | null;
  campaignClicked: number | null;
}

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  campaignStatus?: "all" | "Sent" | "Scheduled" | "Draft" | "Cancelled";
}

const NOW = () => new Date().toISOString();
const THIRTY_DAYS_AGO = () => new Date(Date.now() - 30 * 86400_000).toISOString();

export const getAnalytics = cache(
  async (orgId: string, filters: AnalyticsFilters = {}): Promise<AnalyticsMetrics> => {
    const supabase = await createClient();
    const from = filters.from ?? THIRTY_DAYS_AGO();
    const to = filters.to ?? NOW();

    const [contacts, newContacts, openLeads, upcoming, completed, pendingTasks, overdueTasks] =
      await Promise.all([
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .is("archived_at", null),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .is("archived_at", null)
          .gte("created_at", from)
          .lte("created_at", to),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .not("stage", "in", '("Won","Lost")'),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("status", ["Scheduled", "Confirmed"])
          .gte("starts_at", NOW()),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "Completed")
          .gte("starts_at", from)
          .lte("starts_at", to),
        countPendingTasks(orgId),
        countOverdueTasks(orgId),
      ]);

    const campaigns = await queryCampaignStats(orgId, { ...filters, from, to });

    return {
      totalContacts: contacts.count ?? 0,
      newContacts30d: newContacts.count ?? 0,
      openLeads: openLeads.count ?? 0,
      upcomingAppointments: upcoming.count ?? 0,
      completedAppointments30d: completed.count ?? 0,
      pendingTasks,
      overdueTasks,
      campaignsSent: campaigns?.sent ?? null,
      campaignRecipients: campaigns?.recipients ?? null,
      campaignOpened: campaigns?.opened ?? null,
      campaignClicked: campaigns?.clicked ?? null,
    };
  },
);

interface CampaignStats {
  sent: number;
  recipients: number;
  opened: number;
  clicked: number;
}

/**
 * Best-effort campaign stats. Every access is wrapped so a missing table
 * (M5 not applied) yields null instead of throwing the whole page.
 */
async function queryCampaignStats(
  orgId: string,
  filters: AnalyticsFilters & { from: string; to: string },
): Promise<CampaignStats | null> {
  try {
    const supabase = await createClient();

    let campaignQuery = supabase
      .from("campaigns")
      .select<"id, status, sent_at", CampaignRow>("id, status, sent_at")
      .eq("organization_id", orgId);
    if (filters.campaignStatus && filters.campaignStatus !== "all") {
      campaignQuery = campaignQuery.eq("status", filters.campaignStatus);
    }
    const { data, error } = await campaignQuery;
    if (error || data === null) return null;

    const campaignRows = (data ?? []) as CampaignRow[];
    const sentCampaigns = campaignRows.filter(
      (campaign) =>
        campaign.status === "Sent" &&
        typeof campaign.sent_at === "string" &&
        campaign.sent_at >= filters.from &&
        campaign.sent_at <= filters.to,
    );
    const campaignIds = sentCampaigns.map((campaign) => campaign.id);

    // Recipient-level stats must be scoped to the same sent campaigns.
    if (campaignIds.length === 0) {
      return { sent: 0, recipients: 0, opened: 0, clicked: 0 };
    }
    const [recipients, opened, clicked] = await Promise.all([
      supabase
        .from("campaign_recipients")
        .select<"id", CampaignRecipientRow>("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("campaign_id", campaignIds),
      supabase
        .from("campaign_recipients")
        .select<"id", CampaignRecipientRow>("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("campaign_id", campaignIds)
        .not("opened_at", "is", null),
      supabase
        .from("campaign_recipients")
        .select<"id", CampaignRecipientRow>("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("campaign_id", campaignIds)
        .not("clicked_at", "is", null),
    ]);

    return {
      sent: sentCampaigns.length,
      recipients: recipients.count ?? 0,
      opened: opened.count ?? 0,
      clicked: clicked.count ?? 0,
    };
  } catch {
    return null;
  }
}
