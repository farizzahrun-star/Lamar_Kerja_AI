import { ACTIVE_SCRAPE_PLATFORMS, type JobPlatform } from "./phase2-schemas";

export interface CollectorRunMetric {
  platform: JobPlatform;
  run_date: string;
  started_at: string;
  finished_at: string | null;
  found: number;
  new_count: number;
  skipped_known: number;
  blocked: boolean;
  error_count: number;
}

export interface RunnerAlert {
  code: "blocked_streak" | "low_success_rate" | "runner_stale";
  severity: "warning" | "error";
  platform?: JobPlatform;
  message: string;
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export function evaluateRunnerAlerts(
  runs: CollectorRunMetric[],
  now: Date = new Date(),
): RunnerAlert[] {
  const alerts: RunnerAlert[] = [];

  const scrapeRuns = runs.filter((run) =>
    (ACTIVE_SCRAPE_PLATFORMS as readonly string[]).includes(run.platform),
  );

  if (scrapeRuns.length === 0) {
    alerts.push({
      code: "runner_stale",
      severity: "warning",
      message: "Belum ada riwayat run scraping dari Local Runner.",
    });
    return alerts;
  }

  const latestTimestamp = scrapeRuns
    .map((run) => new Date(run.finished_at ?? run.started_at).getTime())
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => b - a)[0];

  if (latestTimestamp !== undefined && now.getTime() - latestTimestamp > STALE_THRESHOLD_MS) {
    alerts.push({
      code: "runner_stale",
      severity: "warning",
      message: "Tidak ada run scraping sama sekali dalam 48 jam terakhir (runner mungkin mati).",
    });
  }

  for (const platform of ACTIVE_SCRAPE_PLATFORMS) {
    const platformRuns = scrapeRuns.filter((run) => run.platform === platform);
    if (platformRuns.length === 0) continue;

    // Kelompokkan per run_date (ambil tanggal terbaru dulu).
    const byDate = new Map<string, CollectorRunMetric[]>();
    for (const run of platformRuns) {
      const existing = byDate.get(run.run_date) ?? [];
      existing.push(run);
      byDate.set(run.run_date, existing);
    }

    const recentDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 3);
    if (recentDates.length < 3) continue;

    const allThreeBlocked = recentDates.every((date) =>
      (byDate.get(date) ?? []).some((run) => run.blocked),
    );
    if (allThreeBlocked) {
      alerts.push({
        code: "blocked_streak",
        severity: "error",
        platform,
        message: `Platform ${platform} terblokir selama 3 hari run berturut-turut.`,
      });
    }

    const lowSuccessAllThree = recentDates.every((date) => {
      const dayRuns = byDate.get(date) ?? [];
      const found = dayRuns.reduce((sum, item) => sum + item.found, 0);
      const errors = dayRuns.reduce((sum, item) => sum + item.error_count, 0);
      const blocked = dayRuns.some((item) => item.blocked);
      if (blocked) return true;
      if (found === 0) return errors > 0;
      const rate = Math.max(0, found - errors) / found;
      return rate < 0.8;
    });

    if (lowSuccessAllThree && !allThreeBlocked) {
      alerts.push({
        code: "low_success_rate",
        severity: "warning",
        platform,
        message: `Success rate adapter ${platform} di bawah 80% selama 3 hari terakhir.`,
      });
    }
  }

  return alerts;
}
