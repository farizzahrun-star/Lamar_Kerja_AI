import { languageSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, parseBody, unauthorized } from "@/lib/api";
import { ensureProfile } from "@/lib/profile-data";

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, languageSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await ensureProfile(supabase, user.id);

    const { data, error } = await supabase
      .from("languages")
      .insert({ ...parsed.data, profile_id: user.id })
      .select("*")
      .single();

    if (error) return dbErrorResponse(error);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
