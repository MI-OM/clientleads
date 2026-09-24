"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import type { Contact } from "@/lib/crm/types";
import type { CrmState } from "@/lib/crm/actions";
import { formatRelative } from "@/lib/crm/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bulkArchiveContactsAction } from "@/lib/crm/actions";
import { useActionState, useState } from "react";

const initialState: CrmState = {};

export function ContactsTable({ contacts }: { contacts: Contact[] }) {
  const [state, formAction, pending] = useActionState(bulkArchiveContactsAction, initialState);
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = contacts.length > 0 && selected.length === contacts.length;
  const toggleAll = () => setSelected(allSelected ? [] : contacts.map((contact) => contact.id));
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Archive ${selected.length} selected contact${selected.length === 1 ? "" : "s"}?`)) {
          event.preventDefault();
        }
      }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all contacts on this page" />
          Select all on page
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.length} selected</span>
          <Button type="submit" variant="destructive" size="sm" disabled={selected.length === 0 || pending}>
            Archive selected
          </Button>
        </div>
      </div>
      {state.error ? <p role="alert" className="border-b px-4 py-3 text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p role="status" className="border-b px-4 py-3 text-sm text-green-700">{state.success}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3"><input type="checkbox" name="contactId" value={contact.id} checked={selected.includes(contact.id)} onChange={() => toggle(contact.id)} aria-label={`Select ${contact.name}`} /></td>
                <td className="px-4 py-3"><Link href={`/dashboard/contacts/${contact.id}`} className="font-medium text-primary hover:underline">{contact.name}</Link>{contact.archivedAt ? <Badge variant="warning" className="ml-2">Archived</Badge> : null}{contact.company ? <p className="text-xs text-muted-foreground">{contact.company}</p> : null}</td>
                <td className="px-4 py-3"><Badge variant="outline">{contact.contactType}</Badge></td>
                <td className="px-4 py-3">{contact.email ? <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-primary hover:underline"><Mail className="size-3.5" aria-hidden />{contact.email}</a> : <span className="text-muted-foreground">-</span>}{contact.phone ? <a href={`tel:${contact.phone}`} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground hover:text-primary"><Phone className="size-3.5" aria-hidden />{contact.phone}</a> : null}</td>
                <td className="px-4 py-3"><div className="flex max-w-56 flex-wrap gap-1">{contact.tags.slice(0, 3).map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}{contact.tags.length > 3 ? <Badge variant="outline">+{contact.tags.length - 3}</Badge> : null}</div></td>
                <td className="px-4 py-3 text-muted-foreground">{contact.source}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatRelative(contact.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
