import type { ActiveScrapePlatform, RawScrapedJob } from "@lamarkerja/shared";
import type { Page } from "playwright";

import { ADAPTER_REGISTRY } from "./adapters";
import { PlatformBlockedError, type SourceAdapter } from "./adapters/types";
import { openGuestBrowserSession } from "./browser";
import type { RunnerApiClient } from "./client";
import type { RunnerConfig } from "./config";
import { cleanupExpiredDebugHtml, saveDebugHtml } from "./debug-storage";
import { computeRandomDelayMs, createFingerprintChecker } from "./limiter";

export type RunnerLogger = (event: string, data?: Record<string, unknown>) => void;

const defaultLog: RunnerLogger = (event, data) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunDailyDeps {
  config: RunnerConfig;
  client: RunnerApiClient;
  adapters?: Partial<Record<ActiveScrapePlatform, SourceAdapter>>;
  openPage?: () => Promise<{ page: Page; close: () => Promise<void> }>;
  delay?: (ms: number) => Promise<void>;
  rng?: () => number;
  writeDebugHtml?: (params: {
    baseDir: string;
    runDate: string;
    platform: string;
    slug: string;
    html: string;
  }) => Promise<string>;
  cleanDebugHtml?: (baseDir: string, now: Date) => Promise<number>;
  now?: () => Date;
  log?: RunnerLogger;
  forcePull?: boolean;
}

export interface RunDailyOutcome {
  executed: boolean;
  taskId: string | null;
  totalFound: number;
  totalSubmitted: number;
  totalSkippedKnown: number;
  blockedPlatforms: ActiveScrapePlatform[];
}

export async function runDailyScrape(deps: RunDailyDeps): Promise<RunDailyOutcome> {
  const {
    config,
    client,
    adapters = ADAPTER_REGISTRY,
    openPage = () =>
      openGuestBrowserSession({
        browserProfilesDir: config.browserProfilesDir,
        headless: config.headless,
      }),
    delay = defaultSleep,
    rng = Math.random,
    writeDebugHtml = saveDebugHtml,
    cleanDebugHtml = cleanupExpiredDebugHtml,
    now = () => new Date(),
    log = defaultLog,
    forcePull = false,
  } = deps;

  const removedDebugDirs = await cleanDebugHtml(config.debugHtmlDir, now());
  if (removedDebugDirs > 0) {
    log("runner.debug_cleanup", { removedDirs: removedDebugDirs });
  }

  const pulled = await client.pullTasks({ force: forcePull });
  if (!pulled.task) {
    log("runner.no_pending_task");
    return {
      executed: false,
      taskId: null,
      totalFound: 0,
      totalSubmitted: 0,
      totalSkippedKnown: 0,
      blockedPlatforms: [],
    };
  }

  const { task, knownFingerprints } = pulled;
  const checker = createFingerprintChecker(knownFingerprints);
  const session = await openPage();

  let totalFound = 0;
  let totalSubmitted = 0;
  let totalSkippedKnown = 0;
  const blockedPlatforms: ActiveScrapePlatform[] = [];

  try {
    for (const platformPlan of task.plan.platforms) {
      const adapter = adapters[platformPlan.platform];
      if (!adapter) continue;

      const platformStartedAt = now().toISOString();
      const platformLimit = Math.min(config.scrapeLimitPerPlatform, platformPlan.limit);
      const collectedJobs: RawScrapedJob[] = [];
      let found = 0;
      let skippedKnown = 0;
      let errorCount = 0;
      let blocked = false;
      let lastError: string | null = null;

      log("runner.platform_started", {
        platform: platformPlan.platform,
        limit: platformLimit,
        queries: platformPlan.queries.length,
      });

      for (const query of platformPlan.queries) {
        if (blocked || collectedJobs.length >= platformLimit) break;

        try {
          for await (const card of adapter.search(session.page, query)) {
            if (collectedJobs.length >= platformLimit) break;
            found++;

            if (checker.isKnown(card)) {
              skippedKnown++;
              continue;
            }

            const waitMs = computeRandomDelayMs(config.delayMinMs, config.delayMaxMs, rng);
            if (waitMs > 0) await delay(waitMs);

            try {
              const detailRes = await adapter.detail(session.page, card);
              await writeDebugHtml({
                baseDir: config.debugHtmlDir,
                runDate: task.run_date,
                platform: platformPlan.platform,
                slug: detailRes.job.external_id ?? `${collectedJobs.length + 1}`,
                html: detailRes.rawHtml,
              });
              checker.remember(detailRes.job);
              collectedJobs.push(detailRes.job);
            } catch (detailErr) {
              if (detailErr instanceof PlatformBlockedError) {
                blocked = true;
                lastError = detailErr.reason;
                break;
              }
              errorCount++;
              lastError = detailErr instanceof Error ? detailErr.message : String(detailErr);
            }
          }
        } catch (searchErr) {
          if (searchErr instanceof PlatformBlockedError) {
            blocked = true;
            lastError = searchErr.reason;
          } else {
            errorCount++;
            lastError = searchErr instanceof Error ? searchErr.message : String(searchErr);
          }
        }

        if (!blocked && collectedJobs.length < platformLimit) {
          const betweenQueriesMs = computeRandomDelayMs(config.delayMinMs, config.delayMaxMs, rng);
          if (betweenQueriesMs > 0) await delay(betweenQueriesMs);
        }
      }

      if (blocked) {
        blockedPlatforms.push(platformPlan.platform);
      }

      totalFound += found;
      totalSubmitted += collectedJobs.length;
      totalSkippedKnown += skippedKnown;

      await client.submitJobs({
        task_id: task.id,
        platform: platformPlan.platform,
        run_date: task.run_date,
        started_at: platformStartedAt,
        finished_at: now().toISOString(),
        found,
        skipped_known: skippedKnown,
        blocked,
        error_count: errorCount,
        last_error: lastError,
        jobs: collectedJobs,
      });

      log("runner.platform_finished", {
        platform: platformPlan.platform,
        found,
        submitted: collectedJobs.length,
        skippedKnown,
        blocked,
        errorCount,
      });
    }

    const overallStatus =
      blockedPlatforms.length > 0 && blockedPlatforms.length === task.plan.platforms.length
        ? "blocked"
        : "completed";

    await client.reportTaskResult(task.id, {
      status: overallStatus,
      summary: {
        total_found: totalFound,
        total_new_submitted: totalSubmitted,
        total_skipped: totalSkippedKnown,
        blocked_platforms: blockedPlatforms,
      },
      error_message:
        blockedPlatforms.length > 0
          ? `Platform terblokir: ${blockedPlatforms.join(", ")}`
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client
      .reportTaskResult(task.id, {
        status: "failed",
        error_message: message.slice(0, 500),
      })
      .catch(() => {});
    throw error;
  } finally {
    await session.close();
  }

  return {
    executed: true,
    taskId: task.id,
    totalFound,
    totalSubmitted,
    totalSkippedKnown,
    blockedPlatforms,
  };
}
