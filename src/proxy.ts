import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/env";

const PROTECTED_PREFIXES = ["/dashboard"];

/**
 * Next.js 16 renamed `middleware` → `proxy`. Runs in the Node.js runtime.
 *
 * Responsibilities:
 *  - refresh Supabase auth session cookies on every request,
 *  - redirect unauthenticated visitors away from /dashboard,
 *  - redirect signed-in users away from /login and /register.
 *
 * The real auth pages landed in M1; until Supabase env vars are set (M0
 * bootstrap state), the proxy passes everything through so the app can
 * render its "not configured" state.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const { url, anonKey } = getSupabaseConfig();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Important: getUser() validates the session server-side instead of trusting
  // the JWT in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname.startsWith("/login") || pathname.startsWith("/register"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // Session refresh + guards only on routes that need them. Static assets,
  // public business pages (`/platform/*` later) and auth APIs are untouched.
  matcher: ["/dashboard/:path*", "/login", "/register"],
};