import { NextResponse } from "next/server";

import { dbErrorResponse } from "@/lib/api";
import { logEvent } from "@/lib/log";
import { authenticateRunnerRequest } from "@/lib/runner/auth";
import { pullDailyScrapeTaskForRunner } from "@/lib/runner/tasks";

export async function GET(request: Request) {
  const auth = await authenticateRunnerRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const payload = await pullDailyScrapeTaskForRunner(auth.runner.id, { force });
    logEvent("info", "runner.tasks_pulled", {
      runnerId: auth.runner.id,
      hasTask: Boolean(payload.task),
      runDate: payload.task?.run_date ?? null,
    });
    return NextResponse.json({ data: payload });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
