"use client";

import { useActionState } from "react";
import { LEAD_SOURCES, LEAD_STAGES, PRIORITIES } from "@/lib/crm/constants";
import { createLeadAction, updateLeadAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import type { Lead, OrgMember } from "@/lib/crm/types";
import { toLocalInputValue } from "@/lib/crm/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function LeadForm({
  mode,
  contacts,
  members,
  initial,
  preselectContactId,
}: {
  mode: "create" | "edit";
  contacts: Array<{ id: string; name: string }>;
  members: OrgMember[];
  initial?: Lead;
  preselectContactId?: string;
}) {
  const action = mode === "create" ? createLeadAction : updateLeadAction;
  const [state, formAction, pending] = useActionState<CrmState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {mode === "edit" && initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Lead details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="contactId">Contact</Label>
            <Select
              id="contactId"
              name="contactId"
              defaultValue={initial?.contactId ?? preselectContactId ?? ""}
              required
            >
              <option value="">Choose a contact…</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="stage">Stage</Label>
            <Select id="stage" name="stage" defaultValue={initial?.stage ?? "New"}>
              {LEAD_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="priority">Priority</Label>
            <Select id="priority" name="priority" defaultValue={initial?.priority ?? "Normal"}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source">Source</Label>
            <Select id="source" name="source" defaultValue={initial?.source ?? "Manual entry"}>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assignedUserId">Assigned to</Label>
            <Select
              id="assignedUserId"
              name="assignedUserId"
              defaultValue={initial?.assignedUserId ?? ""}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName || "Unnamed member"}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="expectedValue">Expected value ($)</Label>
            <Input
              id="expectedValue"
              name="expectedValue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={initial?.expectedValue ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nextFollowUpAt">Next follow-up</Label>
            <Input
              id="nextFollowUpAt"
              name="nextFollowUpAt"
              type="datetime-local"
              defaultValue={toLocalInputValue(initial?.nextFollowUpAt)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {mode === "create" ? "Create lead" : "Save changes"}
        </Button>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
