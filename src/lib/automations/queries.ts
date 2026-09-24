import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Automation } from "./types";
import { parseActionConfig } from "./types";

/** All automation configs for an org (admin surface is gated at the page/action level). */
export const listAutomations = cache(async (orgId: string): Promise<Automation[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automations")
    .select(
      "id, organization_id, trigger_type, name, active, action_config, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    triggerType: r.trigger_type as Automation["triggerType"],
    name: (r.name as string | null) ?? null,
    active: Boolean(r.active),
    actionConfig: parseActionConfig(r.action_config),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
});

export const getAutomation = cache(
  async (orgId: string, id: string): Promise<Automation | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("automations")
      .select(
        "id, organization_id, trigger_type, name, active, action_config, created_at, updated_at",
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      id: String(data.id),
      organizationId: String(data.organization_id),
      triggerType: data.trigger_type as Automation["triggerType"],
      name: (data.name as string | null) ?? null,
      active: Boolean(data.active),
      actionConfig: parseActionConfig(data.action_config),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  },
);
