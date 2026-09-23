import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Supabase client with NO cookies and the anon key — used only for public
 * data on business pages: `rpc('get_public_page')`. The anon key can never
 * write anything; all writes flow through server actions / route handlers.
 */
export function createPublicClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createSupabaseClient(url, anonKey, { auth: { persistSession: false } });
}