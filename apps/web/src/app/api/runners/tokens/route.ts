import { createRunnerSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, parseBody, unauthorized } from "@/lib/api";
import { createUserRunner } from "@/lib/runner/data";

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, createRunnerSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const created = await createUserRunner(supabase, user.id, parsed.data.name);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
