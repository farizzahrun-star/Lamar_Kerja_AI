import { createInterestSchema, slugifyInterest } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, parseBody, unauthorized } from "@/lib/api";

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, createInterestSchema);
  if (!parsed.ok) return parsed.response;

  const label = parsed.data.label.trim();
  const slug = slugifyInterest(label);

  try {
    const { data: existing, error: readError } = await supabase
      .from("interests")
      .select("id, slug, label, is_default, created_at")
      .or(`slug.eq.${slug},label.ilike.${label}`)
      .limit(1)
      .maybeSingle();

    if (readError) return dbErrorResponse(readError);
    if (existing) {
      return NextResponse.json({ data: existing });
    }

    const { data: created, error: insertError } = await supabase
      .from("interests")
      .insert({
        slug,
        label,
        is_default: false,
      })
      .select("id, slug, label, is_default, created_at")
      .single();

    if (insertError) return dbErrorResponse(insertError);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
