import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Service-role Supabase client. SERVER ONLY — never import from a client
 * component, never expose the key. Used by server actions / route handlers
 * for public writes (form submissions, resource downloads) and for signing
 * private-file URLs. The DB is still the enforcement point: RPCs are
 * SECURITY DEFINER and self-validate; RLS is bypassed by this role.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!serviceRoleKey) {
    throw new Error(
      'Missing environment variable "SUPABASE_SERVICE_ROLE_KEY". Copy .env.example to .env.local and fill it in.',
    );
  }
  return createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
