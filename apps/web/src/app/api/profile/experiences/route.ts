import { experienceSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import {
  dbErrorResponse,
  getApiContext,
  parseBody,
  unauthorized,
} from "@/lib/api";
import { ensureProfile } from "@/lib/profile-data";

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, experienceSchema);
  if (!parsed.ok) return parsed.response;

  const { points, ...fields } = parsed.data;

  try {
    await ensureProfile(supabase, user.id);

    const { data, error } = await supabase
      .from("experiences")
      .insert({ ...fields, profile_id: user.id })
      .select("*")
      .single();

    if (error) return dbErrorResponse(error);

    let pointRows: { id: string; content: string; sort_order: number }[] = [];
    if (points.length > 0) {
      const { data: inserted, error: pointError } = await supabase
        .from("experience_points")
        .insert(
          points.map((content, index) => ({
            experience_id: data.id,
            content,
            sort_order: index,
          })),
        )
        .select("id, content, sort_order");

      if (pointError) return dbErrorResponse(pointError);
      pointRows = inserted ?? [];
    }

    return NextResponse.json({ data: { ...data, points: pointRows } }, { status: 201 });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
