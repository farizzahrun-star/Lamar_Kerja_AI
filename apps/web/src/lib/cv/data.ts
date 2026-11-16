import "server-only";

import type { UploadedCvItem } from "@/lib/profile-types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadUserUploadedCvs(
  supabase: Client,
  userId: string,
): Promise<UploadedCvItem[]> {
  const { data, error } = await supabase
    .from("uploaded_cvs")
    .select("id, original_filename, mime, size_bytes, status, text_content, created_at, delete_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    original_filename: row.original_filename,
    mime: row.mime,
    size_bytes: row.size_bytes,
    status: row.status,
    created_at: row.created_at,
    delete_after: row.delete_after,
    hasText: Boolean(row.text_content && row.text_content.trim().length > 0),
    charCount: row.text_content?.length ?? 0,
  }));
}
