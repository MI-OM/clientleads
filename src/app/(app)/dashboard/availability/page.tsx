import { PageHeader } from "@/components/dashboard/page-header";
import { getMyOrg } from "@/lib/auth/org";
import { listAvailabilityRules, listBlockedTimes } from "@/lib/booking/queries";
import { AvailabilityForm } from "./availability-form";

export default async function AvailabilityPage() {
  const ctx = await getMyOrg();
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  const [rules, blocked] = ctx
    ? await Promise.all([listAvailabilityRules(ctx.org.id), listBlockedTimes(ctx.org.id)])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Availability"
        description="Your weekly booking windows and one-off closures (PRD §17–18)."
      />
      <AvailabilityForm
        rules={rules}
        blocked={blocked}
        canManage={canManage}
        timezone={ctx?.org.timezone ?? "America/Halifax"}
      />
    </div>
  );
}
