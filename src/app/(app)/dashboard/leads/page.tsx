import { getMyOrg } from "@/lib/auth/org";
import { listLeads } from "@/lib/crm/queries";
import type { Lead } from "@/lib/crm/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { LeadBoard } from "./lead-board";

export default async function LeadsPage() {
  const ctx = await getMyOrg();
  if (!ctx) return null;

  const leads = await listLeads(ctx.org.id);
  const byStage: Record<string, Lead[]> = {};
  for (const lead of leads) {
    (byStage[lead.stage] ??= []).push(lead);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads pipeline"
        description="Track potential clients through your stages (PRD §14)."
        actions={
          <Link href="/dashboard/leads/new" className={buttonVariants({})}>
            New lead
          </Link>
        }
      />
      <LeadBoard leadsByStage={byStage} />
    </div>
  );
}
