import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, notFound, parseUuid, unauthorized } from "@/lib/api";
import { loadJobDetail } from "@/lib/jobs/queries";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const jobId = parseUuid(id);
  if (!jobId) return notFound();

  try {
    const detail = await loadJobDetail(supabase, user.id, jobId);
    if (!detail) return notFound();
    return NextResponse.json({ data: detail });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
