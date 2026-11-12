import { identityPatchSchema } from "@lamarkerja/shared";
import type { Database } from "@lamarkerja/db";
import { NextResponse } from "next/server";

import {
  dbErrorResponse,
  getApiContext,
  jsonError,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { ensureProfile, loadProfileBundle } from "@/lib/profile-data";

export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    const bundle = await loadProfileBundle(supabase, user.id);
    return NextResponse.json({ data: bundle });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, identityPatchSchema);
  if (!parsed.ok) return parsed.response;

  const typedUpdates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  ) as Database["public"]["Tables"]["profiles"]["Update"];

  if (Object.keys(typedUpdates).length === 0) {
    return jsonError(400, "VALIDATION_ERROR", "Tidak ada perubahan yang dikirim.");
  }

  try {
    await ensureProfile(supabase, user.id);

    const { data, error } = await supabase
      .from("profiles")
      .update(typedUpdates)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) return dbErrorResponse(error);
    return NextResponse.json({ data });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
