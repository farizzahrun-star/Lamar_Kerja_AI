import {
  SCRAPE_DAILY_LIMIT_PER_PLATFORM,
  SCRAPE_DELAY_MAX_MS,
  SCRAPE_DELAY_MIN_MS,
} from "@lamarkerja/shared";

export interface RunnerConfig {
  serverUrl: string;
  runnerToken: string;
  scrapeLimitPerPlatform: number;
  delayMinMs: number;
  delayMaxMs: number;
  browserProfilesDir: string;
  debugHtmlDir: string;
  headless: boolean;
  pollIntervalMs: number;
}

function readInt(
  source: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const raw = source[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function readRunnerConfig(source: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const serverUrl = (source.RUNNER_SERVER_URL ?? source.APP_URL ?? "http://localhost:3000").trim();
  if (!/^https?:\/\//.test(serverUrl)) {
    throw new Error("RUNNER_SERVER_URL harus berupa URL http(s) yang valid.");
  }

  const runnerToken = source.RUNNER_TOKEN?.trim() ?? "";
  if (!runnerToken) {
    throw new Error(
      "RUNNER_TOKEN wajib diisi (buat token melalui halaman /runner di web).",
    );
  }

  const delayMinMs = readInt(source, "RUNNER_SCRAPE_DELAY_MIN_MS", SCRAPE_DELAY_MIN_MS, {
    min: 0,
  });
  const delayMaxMs = Math.max(
    delayMinMs,
    readInt(source, "RUNNER_SCRAPE_DELAY_MAX_MS", SCRAPE_DELAY_MAX_MS, { min: 0 }),
  );

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    runnerToken,
    scrapeLimitPerPlatform: readInt(
      source,
      "RUNNER_SCRAPE_LIMIT_PER_PLATFORM",
      SCRAPE_DAILY_LIMIT_PER_PLATFORM,
      { min: 1, max: SCRAPE_DAILY_LIMIT_PER_PLATFORM },
    ),
    delayMinMs,
    delayMaxMs,
    browserProfilesDir:
      (source.RUNNER_BROWSER_PROFILES_DIR ?? "./browser-profiles").trim() || "./browser-profiles",
    debugHtmlDir:
      (source.RUNNER_DEBUG_HTML_DIR ?? "./data/runner-debug").trim() || "./data/runner-debug",
    headless: source.RUNNER_HEADLESS !== "false",
    pollIntervalMs: readInt(source, "RUNNER_POLL_INTERVAL_MS", 3_600_000, { min: 5_000 }),
  };
}
