import { skillSchema } from "@lamarkerja/shared";
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

export async function PATCH(request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const skillId = parseUuid(id);
  if (!skillId) return notFound();

  const parsed = await parseBody(request, skillSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await supabase
    .from("skills")
    .update(parsed.data)
    .eq("id", skillId)
    .eq("profile_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return dbErrorResponse(error);
  if (!data) return notFound();
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const skillId = parseUuid(id);
  if (!skillId) return notFound();

  const { data, error } = await supabase
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("profile_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return dbErrorResponse(error);
  if (!data) return notFound();
  return NextResponse.json({ data: { id: data.id } });
}
