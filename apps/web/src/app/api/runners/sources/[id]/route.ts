import { toggleJobSourceSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import {
  dbErrorResponse,
  getApiContext,
  jsonError,
  notFound,
  parseBody,
  parseUuid,
  unauthorized,
} from "@/lib/api";
import { getAdminAccess } from "@/lib/auth";
import { toggleJobSourceEnabled } from "@/lib/runner/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { user } = await getApiContext();
  if (!user) return unauthorized();

  const adminAccess = getAdminAccess(user);
  if (!adminAccess.isAdmin) {
    return jsonError(
      403,
      "FORBIDDEN",
      "Hanya admin yang dapat mengubah kill switch sumber lowongan.",
    );
  }

  const { id } = await params;
  const sourceId = parseUuid(id);
  if (!sourceId) return notFound();

  const parsed = await parseBody(request, toggleJobSourceSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const updated = await toggleJobSourceEnabled({
      actorId: user.id,
      sourceId,
      enabled: parsed.data.enabled,
    });
    if (!updated) return notFound();
    return NextResponse.json({ data: updated });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
