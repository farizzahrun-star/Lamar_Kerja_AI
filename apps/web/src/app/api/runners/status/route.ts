import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, unauthorized } from "@/lib/api";
import { loadRunnerDashboard } from "@/lib/runner/data";

export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    const dashboard = await loadRunnerDashboard(supabase, user);
    return NextResponse.json({ data: dashboard });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
