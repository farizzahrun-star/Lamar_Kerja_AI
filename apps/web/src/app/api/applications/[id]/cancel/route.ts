import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, jsonError, notFound, parseUuid, unauthorized } from "@/lib/api";
import { cancelUserApplication } from "@/lib/applications/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const applicationId = parseUuid(id);
  if (!applicationId) return notFound();

  try {
    const result = await cancelUserApplication(supabase, user.id, applicationId);
    if (!result.ok) {
      return jsonError(result.status, result.code, result.message);
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
