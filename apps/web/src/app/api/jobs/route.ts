import {
  APPLY_CHANNELS,
  JOB_PLATFORMS,
  WORK_MODES,
  type ApplyChannel,
  type JobPlatform,
  type WorkMode,
} from "@lamarkerja/shared";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, unauthorized } from "@/lib/api";
import { loadJobsFeed } from "@/lib/jobs/queries";

export async function GET(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const snapshotParam = url.searchParams.get("snapshot");
  const snapshot =
    snapshotParam === "today" || snapshotParam === "all" || snapshotParam === "h1"
      ? snapshotParam
      : "h1";
  const showAll = url.searchParams.get("showAll") === "true";

  const rawPlatform = url.searchParams.get("platform");
  const platform =
    rawPlatform && (JOB_PLATFORMS as readonly string[]).includes(rawPlatform)
      ? (rawPlatform as JobPlatform)
      : "all";

  const rawWorkMode = url.searchParams.get("workMode");
  const workMode =
    rawWorkMode && (WORK_MODES as readonly string[]).includes(rawWorkMode)
      ? (rawWorkMode as WorkMode)
      : "all";

  const rawChannel = url.searchParams.get("channel");
  const channel =
    rawChannel && (APPLY_CHANNELS as readonly string[]).includes(rawChannel)
      ? (rawChannel as ApplyChannel)
      : "all";

  const query = url.searchParams.get("q") ?? undefined;

  try {
    const result = await loadJobsFeed(supabase, user.id, {
      snapshot,
      showAll,
      platform,
      workMode,
      channel,
      query,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}
