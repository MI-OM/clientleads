import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface DownloadParams {
  id: string;
}

/**
 * Public resource download (PRD §30–31, §65).
 *
 * Everything runs server-side with the service role key:
 *  1. `record_resource_download` validates the resource is published, and —
 *     for gated resources — that a valid one-time token is presented.
 *  2. On success it records the activity + bumps the download counter.
 *  3. The route issues a short-lived signed URL to the private bucket and
 *     redirects. Private files are never served via predictable URLs.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<DownloadParams> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const token = request.nextUrl.searchParams.get("token") ?? null;
    if (token && !/^[0-9a-f-]{36}$/i.test(token)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_resource_download", {
      p_resource_id: id,
      p_token: token,
    });
    if (error) {
      if (/RESOURCE_NOT_FOUND/i.test(error.message)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (/RESOURCE_GATE_REQUIRED/i.test(error.message)) {
        return NextResponse.json(
          { error: "This download requires a valid request — return to the page and try again." },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "Download temporarily unavailable." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const filePath = (data as { file_path?: string }).file_path;
    const fileName = (data as { file_name?: string }).file_name;
    if (!filePath) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("resources")
      .createSignedUrl(filePath, 3600, fileName ? { download: fileName } : undefined);

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: "Could not prepare the download. Please try again." }, { status: 500 });
    }

    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch {
    return NextResponse.json({ error: "Download temporarily unavailable." }, { status: 500 });
  }
}