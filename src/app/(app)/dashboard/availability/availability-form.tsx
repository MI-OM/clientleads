"use client";

import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DAY_NAMES } from "@/lib/booking/types";
import type { AvailabilityRule, BlockedTime } from "@/lib/booking/types";
import {
  addAvailabilityRuleAction,
  addBlockedTimeAction,
  deleteAvailabilityRuleAction,
  deleteBlockedTimeAction,
  type AvailabilityActionState,
} from "./actions";

const initialState: AvailabilityActionState = {};

function formatLocalRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${start.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} – ${end.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function AvailabilityForm({
  rules,
  blocked,
  canManage,
  timezone,
}: {
  rules: AvailabilityRule[];
  blocked: BlockedTime[];
  canManage: boolean;
  timezone: string;
}) {
  const [ruleState, ruleAction, rulePending] = useActionState(
    addAvailabilityRuleAction,
    initialState,
  );
  const [blockedState, blockedAction, blockedPending] = useActionState(
    addBlockedTimeAction,
    initialState,
  );

  const groupedRules = DAY_NAMES.map((name, dow) => ({
    dow,
    name,
    windows: rules.filter((r) => r.dayOfWeek === dow),
  }));

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Weekly hours</h2>
            <p className="text-sm text-muted-foreground">
              Available booking windows, repeating weekly · {timezone}
            </p>
          </div>
        </div>

        {canManage ? (
          <form
            action={ruleAction}
            className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/40 px-5 py-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-day" className="text-xs">
                Day
              </Label>
              <Select id="rule-day" name="day" defaultValue="1" className="w-36">
                {DAY_NAMES.map((name, dow) => (
                  <option key={dow} value={dow}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-start" className="text-xs">
                Opens
              </Label>
              <Input id="rule-start" name="start" type="time" required className="w-32" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-end" className="text-xs">
                Closes
              </Label>
              <Input id="rule-end" name="end" type="time" required className="w-32" />
            </div>
            <Button type="submit" disabled={rulePending}>
              <Plus className="size-4" aria-hidden /> Add window
            </Button>
          </form>
        ) : null}

        {ruleState.error ? (
          <p className="border-b border-border bg-destructive/5 px-5 py-2 text-sm text-destructive">
            {ruleState.error}
          </p>
        ) : null}

        <div className="px-5 py-4">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No weekly hours set yet — bookable services will have no open slots.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {groupedRules.map(({ dow, name, windows }) =>
                windows.length === 0 ? null : (
                  <div
                    key={dow}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  >
                    <span className="w-24 shrink-0 font-medium">{name}</span>
                    <div className="flex flex-wrap gap-2">
                      {windows.map((rule) => (
                        <span
                          key={rule.id}
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-sm"
                        >
                          {rule.startTime} – {rule.endTime}
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {rule.active ? "active" : "off"}
                          </Badge>
                          {canManage ? (
                            <form action={deleteAvailabilityRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                aria-label={`Remove ${name} ${rule.startTime}–${rule.endTime}`}
                              >
                                <Trash2 className="size-3.5 text-muted-foreground" />
                              </Button>
                            </form>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Blocked times</h2>
          <p className="text-sm text-muted-foreground">
            One-off closures — holidays, vacations, maintenance (PRD §18).
          </p>
        </div>

        {canManage ? (
          <form
            action={blockedAction}
            className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/40 px-5 py-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blocked-start" className="text-xs">
                Starts
              </Label>
              <Input
                id="blocked-start"
                name="startsAt"
                type="datetime-local"
                required
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blocked-end" className="text-xs">
                Ends
              </Label>
              <Input
                id="blocked-end"
                name="endsAt"
                type="datetime-local"
                required
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blocked-reason" className="text-xs">
                Reason (optional)
              </Label>
              <Input
                id="blocked-reason"
                name="reason"
                placeholder="e.g. Long weekend"
                className="w-56"
              />
            </div>
            <Button type="submit" disabled={blockedPending}>
              <Plus className="size-4" aria-hidden /> Block
            </Button>
          </form>
        ) : null}

        {blockedState.error ? (
          <p className="border-b border-border bg-destructive/5 px-5 py-2 text-sm text-destructive">
            {blockedState.error}
          </p>
        ) : null}

        <div className="px-5 py-4">
          {blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blocked times.</p>
          ) : (
            <ul className="divide-y divide-border">
              {blocked.map((block) => (
                <li key={block.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatLocalRange(block.startsAt, block.endsAt)}
                    </span>
                    {block.reason ? (
                      <span className="text-sm text-muted-foreground">· {block.reason}</span>
                    ) : null}
                  </div>
                  {canManage ? (
                    <form action={deleteBlockedTimeAction}>
                      <input type="hidden" name="id" value={block.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label="Remove blocked time"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
