"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UnsubscribeState {
  error?: string;
  ok?: boolean;
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public unsubscribe confirmation (PRD §29). The uuid token is the
 * capability — the org is derived from the recipient row inside the
 * service-role `unsubscribe_contact` RPC, so nothing here can be shared
 * across organizations.
 */
export async function confirmUnsubscribeAction(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  if (!TOKEN_RE.test(token)) return { error: "That opt-out link isn't valid." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("unsubscribe_contact", { p_token: token });
  if (error || !data?.ok) {
    const reason = error?.message ?? String(data ?? "UNSUBSCRIBE_FAILED");
    if (/UNSUBSCRIBE_NOT_FOUND/.test(reason)) {
      return { error: "That opt-out link isn't valid anymore." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath(`/${slug}/unsubscribe/${token}`);
  return { ok: true };
}
