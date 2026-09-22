"use client";

import { useState, useActionState } from "react";
import { addNoteAction } from "@/lib/crm/actions";
import type { CrmState } from "@/lib/crm/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Quick "add note" box — used on contact and lead detail pages. */
export function NoteForm({ contactId, leadId }: { contactId?: string; leadId?: string }) {
  const [note, setNote] = useState("");
  const [state, , pending] = useActionState<CrmState, FormData>(addNoteAction, {});
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      action={async (payload) => {
        const result = await addNoteAction(state, payload);
        if (!result?.error) {
          setNote("");
          setSubmitted(true);
          setTimeout(() => setSubmitted(false), 2000);
        }
      }}
      className="flex flex-col gap-2"
    >
      {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}
      {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
      <Textarea
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Log a note on the timeline…"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm" role="status">
          {submitted ? <span className="text-primary">Note added.</span> : null}
          {state?.error && !submitted ? (
            <span className="text-destructive">{state.error}</span>
          ) : null}
        </p>
        <Button type="submit" size="sm" loading={pending} disabled={!note.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}
