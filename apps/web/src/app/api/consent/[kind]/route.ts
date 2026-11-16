import { consentKindSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, unauthorized, zodErrorResponse } from "@/lib/api";
import { getConsentStatus, requireConsent, revokeConsent } from "@/lib/consent";

type RouteContext = { params: Promise<{ kind: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { kind } = await params;
  const parsedKind = consentKindSchema.safeParse(kind);
  if (!parsedKind.success) return zodErrorResponse(parsedKind.error);

  const url = new URL(request.url);
  if (url.searchParams.get("enforce") === "1") {
    try {
      const check = await requireConsent(supabase, user.id, parsedKind.data);
      if (!check.ok) return check.response;
    } catch (error) {
      return dbErrorResponse(error as { code?: string });
    }
  }

  try {
    const status = await getConsentStatus(supabase, user.id, parsedKind.data);
    return NextResponse.json({ data: status });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const { kind } = await params;
  const parsedKind = consentKindSchema.safeParse(kind);
  if (!parsedKind.success) return zodErrorResponse(parsedKind.error);

  try {
    const result = await revokeConsent(supabase, user.id, parsedKind.data);
    return NextResponse.json({ data: result });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
