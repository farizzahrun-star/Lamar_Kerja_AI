import { runnerTaskResultSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, notFound, parseBody, parseUuid } from "@/lib/api";
import { recordAuditLog } from "@/lib/consent";
import { logEvent } from "@/lib/log";
import { authenticateRunnerRequest } from "@/lib/runner/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateRunnerRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const taskId = parseUuid(id);
  if (!taskId) return notFound();

  const parsed = await parseBody(request, runnerTaskResultSchema);
  if (!parsed.ok) return parsed.response;

  const admin = createAdminSupabase();
  const nowIso = new Date().toISOString();

  try {
    const { data: existing, error: readError } = await admin
      .from("runner_tasks")
      .select("id")
      .eq("id", taskId)
      .maybeSingle();

    if (readError) return dbErrorResponse(readError);
    if (!existing) return notFound();

    const { data: updated, error: updateError } = await admin
      .from("runner_tasks")
      .update({
        runner_id: auth.runner.id,
        status: parsed.data.status,
        result_json: (parsed.data.summary ?? null) as never,
        error_message: parsed.data.error_message,
        finished_at: nowIso,
      })
      .eq("id", taskId)
      .select("id, status, finished_at")
      .single();

    if (updateError) return dbErrorResponse(updateError);

    await recordAuditLog({
      actorId: auth.runner.user_id,
      action: "runner.task_reported",
      entity: "runner_tasks",
      entityId: updated.id,
      meta: {
        runnerId: auth.runner.id,
        status: updated.status,
      },
    });

    logEvent("info", "runner.task_reported", {
      runnerId: auth.runner.id,
      taskId: updated.id,
      status: updated.status,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
