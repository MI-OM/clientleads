import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import type { UnsubscribeContext } from "@/lib/campaigns/types";
import { UnsubscribePanel } from "./panel";

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await params;
  return {
    title: "Unsubscribe",
    description: "Manage your email preferences.",
    robots: { index: false, follow: false },
  };
}

function mapContext(payload: unknown): UnsubscribeContext | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || p.ok !== true) return null;
  if (typeof p.org_name !== "string" && typeof p.first_name !== "string") return null;
  return {
    orgName: String(p.org_name ?? ""),
    firstName: String(p.first_name ?? ""),
    alreadyUnsubscribed: Boolean(p.already_unsubscribed),
  };
}

export default async function UnsubscribePage({ params }: PageProps) {
  const { slug, token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token) || !isSupabaseConfigured()) notFound();

  // Leak-free anon read: returns only THIS recipient's own minimal fields.
  const client = createPublicClient();
  const { data, error } = await client.rpc("get_unsubscribe_ctx", { p_token: token });
  const ctx = error ? null : mapContext(data);
  if (!ctx) notFound();

  return (
    <UnsubscribePanel
      slug={slug}
      token={token}
      orgName={ctx.orgName || slug}
      firstName={ctx.firstName}
      alreadyUnsubscribed={ctx.alreadyUnsubscribed}
    />
  );
}
