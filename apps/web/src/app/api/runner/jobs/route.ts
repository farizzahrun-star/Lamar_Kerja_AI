import { runnerJobsSubmissionSchema } from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, parseBody } from "@/lib/api";
import { recordAuditLog } from "@/lib/consent";
import { logEvent } from "@/lib/log";
import { authenticateRunnerRequest } from "@/lib/runner/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await authenticateRunnerRequest(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, runnerJobsSubmissionSchema);
  if (!parsed.ok) return parsed.response;

  const submission = parsed.data;
  const admin = createAdminSupabase();

  try {
    const { data: collectorRun, error: runError } = await admin
      .from("collector_runs")
      .insert({
        runner_id: auth.runner.id,
        platform: submission.platform,
        run_date: submission.run_date,
        started_at: submission.started_at,
        finished_at: submission.finished_at,
        found: submission.found,
        new_count: 0,
        skipped_known: submission.skipped_known,
        blocked: submission.blocked,
        error_count: submission.error_count,
        last_error: submission.last_error,
      })
      .select("id")
      .single();

    if (runError) return dbErrorResponse(runError);

    const { data: batch, error: batchError } = await admin
      .from("job_ingest_batches")
      .insert({
        runner_id: auth.runner.id,
        collector_run_id: collectorRun.id,
        platform: submission.platform,
        run_date: submission.run_date,
        status: "pending",
        payload_json: {
          task_id: submission.task_id,
          jobs: submission.jobs,
        } as never,
      })
      .select("id, status")
      .single();

    if (batchError) return dbErrorResponse(batchError);

    await recordAuditLog({
      actorId: auth.runner.user_id,
      action: "runner.jobs_submitted",
      entity: "job_ingest_batches",
      entityId: batch.id,
      meta: {
        runnerId: auth.runner.id,
        platform: submission.platform,
        runDate: submission.run_date,
        jobsCount: submission.jobs.length,
        blocked: submission.blocked,
      },
    });

    logEvent("info", "runner.jobs_submitted", {
      runnerId: auth.runner.id,
      batchId: batch.id,
      collectorRunId: collectorRun.id,
      platform: submission.platform,
      jobsCount: submission.jobs.length,
      blocked: submission.blocked,
    });

    return NextResponse.json(
      {
        data: {
          batchId: batch.id,
          collectorRunId: collectorRun.id,
          status: batch.status,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
