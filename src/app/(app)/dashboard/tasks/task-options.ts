import { cache } from "react";
import { listContactOptions, listLeads, listOrgMembers } from "@/lib/crm/queries";
import { listAppointments } from "@/lib/booking/queries";
import type { TaskFormOption } from "./task-form";

/** Option lists for the task create/edit form (server-side, cached per request). */
export const getTaskFormOptions = cache(async (orgId: string) => {
  const [members, contacts, leads, appointments] = await Promise.all([
    listOrgMembers(orgId),
    listContactOptions(orgId),
    listLeads(orgId),
    listAppointments(orgId),
  ]);

  const fmt = (when: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(when));
    } catch {
      return when;
    }
  };

  return {
    members: members.map((m): TaskFormOption => ({
      id: m.id,
      label: m.fullName || "Unnamed member",
    })),
    contacts: contacts.map((c): TaskFormOption => ({ id: c.id, label: c.name })),
    leads: leads.map((l): TaskFormOption => ({
      id: l.id,
      label: `${l.contactName ?? "Unnamed lead"} · ${l.stage}`,
    })),
    appointments: appointments.map((a): TaskFormOption => ({
      id: a.id,
      label: `${a.customerName} · ${fmt(a.startsAt)} · ${a.status}`,
    })),
  };
});
