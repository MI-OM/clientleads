import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { parsePublicPage, type PublicPage } from "@/lib/public/types";

/**
 * Fetch the public page payload for a business slug through the single
 * leak-free RPC. Returns null when the business doesn't exist (or the
 * database isn't reachable — callers render the 404 either way).
 */
export async function getPublicPageData(slug: string): Promise<PublicPage | null> {
  if (!isSupabaseConfigured()) return null;
  if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(slug)) return null;

  try {
    const client = createPublicClient();
    const { data, error } = await client.rpc("get_public_page", { p_slug: slug });
    if (error) return null;
    return parsePublicPage(data);
  } catch {
    return null;
  }
}