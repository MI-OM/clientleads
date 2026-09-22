/**
 * Centralized, validated access to environment variables.
 *
 * Rule: anything prefixed NEXT_PUBLIC_ is safe for the client.
 * Everything else is server-only — never import it from a client component.
 */

function toRequired(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable "${name}". Copy .env.example to .env.local and fill in your Supabase details.`,
    );
  }
  return value;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * Returns the Supabase config, throwing if it isn't present.
 * Only call this on the server (or from code that is gated on
 * `isSupabaseConfigured()`).
 */
export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: toRequired(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: toRequired(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}