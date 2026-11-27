import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, notFound, parseUuid, unauthorized } from "@/lib/api";
import { revokeUserRunner } from "@/lib/runner/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { id } = await params;
  const runnerId = parseUuid(id);
  if (!runnerId) return notFound();

  try {
    const revoked = await revokeUserRunner(supabase, user.id, runnerId);
    if (!revoked) return notFound();
    return NextResponse.json({ data: revoked });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
