import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Public slot lookup for the booking wizard — the ONLY slots surface, backed
 * by the leak-free get_available_slots RPC (anon). It returns just available
 * start timestamps for one service on one date; nothing else.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ slots: [], error: "not_configured" }, { status: 503 });
  }

  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const service = request.nextUrl.searchParams.get("service") ?? "";
  const date = request.nextUrl.searchParams.get("date") ?? "";

  if (!/^[a-zA-Z0-9-]+$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(service) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ slots: [], error: "bad_request" }, { status: 400 });
  }

  try {
    const client = createPublicClient();
    const { data, error } = await client.rpc("get_available_slots", {
      p_slug: slug,
      p_service_id: service,
      p_date: date,
    });
    if (error) {
      return NextResponse.json({ slots: [], error: "unavailable" }, { status: 200 });
    }
    const slots = Array.isArray(data) ? data.map((s) => String(s)) : [];
    return NextResponse.json({ slots });
  } catch {
    return NextResponse.json({ slots: [], error: "unavailable" }, { status: 200 });
  }
}