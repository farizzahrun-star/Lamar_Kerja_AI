import { experienceSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import {
  dbErrorResponse,
  getApiContext,
  notFound,
  parseBody,
  parseUuid,
  unauthorized,
} from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Update bersifat full replace: `points` yang dikirim menggantikan seluruh poin
 * lama. UI selalu mengirim array lengkap, jadi perilaku ini eksplisit.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const experienceId = parseUuid(id);
  if (!experienceId) return notFound();

  const parsed = await parseBody(request, experienceSchema);
  if (!parsed.ok) return parsed.response;

  const { points, ...fields } = parsed.data;

  const { data, error } = await supabase
    .from("experiences")
    .update(fields)
    .eq("id", experienceId)
    .eq("profile_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return dbErrorResponse(error);
  if (!data) return notFound();

  const { error: deleteError } = await supabase
    .from("experience_points")
    .delete()
    .eq("experience_id", experienceId);

  if (deleteError) return dbErrorResponse(deleteError);

  let pointRows: { id: string; content: string; sort_order: number }[] = [];
  if (points.length > 0) {
    const { data: inserted, error: pointError } = await supabase
      .from("experience_points")
      .insert(
        points.map((content, index) => ({
          experience_id: experienceId,
          content,
          sort_order: index,
        })),
      )
      .select("id, content, sort_order");

    if (pointError) return dbErrorResponse(pointError);
    pointRows = inserted ?? [];
  }

  return NextResponse.json({ data: { ...data, points: pointRows } });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const experienceId = parseUuid(id);
  if (!experienceId) return notFound();

  const { data, error } = await supabase
    .from("experiences")
    .delete()
    .eq("id", experienceId)
    .eq("profile_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return dbErrorResponse(error);
  if (!data) return notFound();
  return NextResponse.json({ data: { id: data.id } });
}
