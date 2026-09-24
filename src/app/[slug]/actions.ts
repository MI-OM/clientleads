"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PublicFormState {
  error?: string;
  success?: string;
  redirectTo?: string;
}

/** Best-effort client IP for rate limiting. Hashed — never stored raw. */
async function ipHash(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    return createHash("sha256").update(ip).digest("hex");
  } catch {
    return null;
  }
}

/** Extract `field_xxx` values submitted by the public lead form. */
function collectValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (key.startsWith("field_")) {
      const fieldKey = key.slice("field_".length);
      const all = formData
        .getAll(key)
        .map((v) => String(v).trim())
        .filter(Boolean);
      const value = all.join(", ");
      values[fieldKey] = value;
    }
  }
  return values;
}

/**
 * Public lead form submission (PRD §22–23). The honeypot + server-side
 * validation happen here; the DB does the real work through the
 * SECURITY DEFINER `submit_public_form` RPC (rate limit, required fields,
 * contact matching, activity, lead). Service role key never leaves the
 * server and is never granted to anon.
 */
export async function submitFormAction(
  _prev: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  const formSlug = String(formData.get("form_slug") ?? "").trim();
  const pageSlug = String(formData.get("page_slug") ?? "").trim();
  if (!formSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(formSlug)) {
    return { error: "Something went wrong sending your message. Please refresh and try again." };
  }

  // Honeypot: bots fill this invisible field; humans never do.
  if (String(formData.get("company_website") ?? "") !== "") {
    return { success: "Thanks — your message has been sent." };
  }

  const values = collectValues(formData);
  values.name = values.name ?? values.full_name ?? "";
  values.email = values.email ?? "";
  values.phone = values.phone ?? "";
  values.message = values.message ?? "";

  const serviceRequested = values.service_requested;
  if (serviceRequested) {
    values.message = [`Service requested: ${serviceRequested}`, values.message]
      .filter(Boolean)
      .join("\n\n");
  }

  if (!values.name && !values.email && !values.phone && !values.message) {
    return { error: "Please fill in at least one field before sending." };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_public_form", {
      p_form_slug: formSlug,
      p_ip_hash: await ipHash(),
      p_values: values,
    });

    if (error) return { error: friendlySubmitError(error.message) };
    if (!data || (data as { ok?: boolean }).ok !== true) {
      return { error: "Something went wrong sending your message. Please try again." };
    }

    if (pageSlug) revalidatePath(`/${pageSlug}`);
    return { success: "Thanks — your message has been sent. We'll get back to you soon." };
  } catch {
    return { error: "Something went wrong sending your message. Please try again later." };
  }
}

/**
 * Gate form for gated resources (PRD §31): capture name/email/phone, then
 * hand the visitor a one-time download token the download route validates.
 */
export async function requestResourceAction(
  _prev: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  const resourceId = String(formData.get("resource_id") ?? "").trim();
  const pageSlug = String(formData.get("page_slug") ?? "").trim();
  if (!resourceId || !/^[0-9a-f-]{36}$/i.test(resourceId)) {
    return { error: "Something went wrong. Please refresh and try again." };
  }

  if (String(formData.get("company_website") ?? "") !== "") {
    return { success: "Thanks! Your download will start shortly." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { error: "Please enter your name." };
  if (!email) return { error: "Please enter your email address." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("request_resource_download", {
      p_resource_id: resourceId,
      p_name: name,
      p_email: email,
      p_phone: phone || null,
    });

    if (error) return { error: friendlyGateError(error.message) };
    const result = data as { ok?: boolean; token?: string } | null;
    if (!result || result.ok !== true || !result.token) {
      return { error: "Something went wrong. Please try again." };
    }

    if (pageSlug) revalidatePath(`/${pageSlug}`);
    return {
      redirectTo: `/api/public/resources/${resourceId}/download?token=${result.token}`,
    };
  } catch {
    return { error: "Something went wrong. Please try again later." };
  }
}

function friendlySubmitError(message: string): string {
  if (/FORM_RATE_LIMITED/i.test(message)) {
    return "You've sent quite a few messages recently. Please wait a bit and try again.";
  }
  if (/FORM_INVALID_EMAIL/i.test(message)) {
    return "That email address doesn't look right — please double-check it.";
  }
  if (/FORM_FIELD_REQUIRED/i.test(message)) {
    return "Please fill in all required fields.";
  }
  return "Something went wrong sending your message. Please try again.";
}

function friendlyGateError(message: string): string {
  if (/RESOURCE_GATE_EMAIL_REQUIRED/i.test(message)) {
    return "Please enter a valid email address.";
  }
  if (/RESOURCE_GATE_NAME_REQUIRED/i.test(message)) {
    return "Please enter your name.";
  }
  return "Something went wrong. Please try again.";
}
