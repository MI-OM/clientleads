import { createClient } from "@/lib/supabase/server";

export interface Resource {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  thumbnailPath: string | null;
  visibility: "public" | "private";
  published: boolean;
  gated: boolean;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ResourceRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  thumbnail_path: string | null;
  visibility: "public" | "private";
  published: boolean;
  gated: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
}

function mapResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    thumbnailPath: row.thumbnail_path,
    visibility: row.visibility,
    published: row.published,
    gated: row.gated,
    downloadCount: row.download_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listResources(orgId: string): Promise<Resource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapResource(row as unknown as ResourceRow));
}

export async function getResource(orgId: string, id: string): Promise<Resource | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapResource(data as unknown as ResourceRow) : null;
}