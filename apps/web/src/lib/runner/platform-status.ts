import {
  ACTIVE_SCRAPE_PLATFORMS,
  type CollectorRunMetric,
  type JobPlatform,
} from "@lamarkerja/shared";

import type { JobSourceRow, PlatformStatusSummary } from "@/lib/phase2-types";

export interface CollectorRunSummaryRow extends CollectorRunMetric {
  last_error: string | null;
}

export function buildPlatformStatusSummary(
  sources: JobSourceRow[],
  runs: CollectorRunSummaryRow[],
): PlatformStatusSummary[] {
  const platforms: JobPlatform[] = [...ACTIVE_SCRAPE_PLATFORMS, "manual"];

  return platforms.map((platform) => {
    const platformSources = sources.filter((source) => source.platform === platform);
    const sourceEnabled =
      platformSources.length === 0 ? true : platformSources.some((source) => source.enabled);

    const latestRun = runs
      .filter((run) => run.platform === platform)
      .sort((a, b) => {
        const dateCmp = b.run_date.localeCompare(a.run_date);
        if (dateCmp !== 0) return dateCmp;
        return b.started_at.localeCompare(a.started_at);
      })[0];

    return {
      platform,
      sourceEnabled,
      lastRunDate: latestRun?.run_date ?? null,
      lastRunAt: latestRun ? (latestRun.finished_at ?? latestRun.started_at) : null,
      blocked: latestRun?.blocked ?? false,
      found: latestRun?.found ?? 0,
      newCount: latestRun?.new_count ?? 0,
      errorCount: latestRun?.error_count ?? 0,
      lastError: latestRun?.last_error ?? null,
    };
  });
}
