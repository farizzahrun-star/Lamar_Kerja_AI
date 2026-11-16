import { consentGrantSchema, consentKindSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, parseBody, unauthorized, zodErrorResponse } from "@/lib/api";
import { getConsentStatus, grantConsent } from "@/lib/consent";

export async function GET(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const rawKind = url.searchParams.get("kind") ?? "cv_ai_processing";
  const parsedKind = consentKindSchema.safeParse(rawKind);
  if (!parsedKind.success) return zodErrorResponse(parsedKind.error);

  try {
    const status = await getConsentStatus(supabase, user.id, parsedKind.data);
    return NextResponse.json({ data: status });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, consentGrantSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await grantConsent(
      supabase,
      user.id,
      parsed.data.kind,
      request.headers.get("user-agent"),
      parsed.data.version,
    );

    return NextResponse.json(
      { data: result.status },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
