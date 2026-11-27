import { queueApplicationsSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, jsonError, parseBody, unauthorized } from "@/lib/api";
import { loadUserApplications, queueApplicationsForUser } from "@/lib/applications/service";

export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    const overview = await loadUserApplications(supabase, user.id);
    return NextResponse.json({ data: overview });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, queueApplicationsSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await queueApplicationsForUser(supabase, user.id, parsed.data.jobIds);
    if (!result.ok) {
      return jsonError(result.status, result.code, result.message);
    }
    return NextResponse.json(
      { data: { created: result.created, quota: result.quota } },
      { status: 201 },
    );
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
