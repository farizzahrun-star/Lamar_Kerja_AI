/**
 * Entry point worker Lamar Kerja AI.
 *
 * Phase 1 hanya membutuhkan satu job: `cv.parse` (M3). Worker berjalan sebagai
 * proses terpisah yang polling tabel `cv_parse_runs` di Supabase memakai secret
 * key, jadi tidak butuh koneksi `DATABASE_URL` langsung.
 *
 * Jalankan dari root repo:
 *   pnpm --filter @lamarkerja/workers dev
 * atau dari folder `workers`:
 *   pnpm dev
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

import { CircuitBreaker } from "./circuit-breaker";
import { cleanupExpiredCvs } from "./cleanup";
import { readConfig, type WorkerConfig } from "./config";
import { loadEnvFile } from "./env-file";
import { createOllamaClient, type OllamaClient } from "./ollama";
import { claimRun, processRun, skipAllPendingRuns, type ParseDeps } from "./parse";
import { createWorkerSupabase, type WorkerSupabase } from "./supabase";

export const JOBS = [
  { name: "cv.parse", pollIntervalMs: 5_000 },
  { name: "cv.cleanup", pollIntervalMs: 3_600_000 },
] as const;

export interface WorkerRuntime {
  config: WorkerConfig;
  supabase: WorkerSupabase;
  ollama: OllamaClient;
  breaker: CircuitBreaker;
  lastCleanupAt: number;
}

export function createRuntime(config: WorkerConfig): WorkerRuntime {
  return {
    config,
    supabase: createWorkerSupabase(config.supabaseUrl, config.supabaseSecretKey),
    ollama: createOllamaClient({
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaModel,
      numCtx: config.ollamaNumCtx,
      timeoutMs: config.ollamaTimeoutMs,
    }),
    breaker: new CircuitBreaker(),
    lastCleanupAt: 0,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const log = (event: string, data?: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

/**
 * Satu iterasi loop. Diekspor agar bisa diuji tanpa menjalankan proses panjang.
 */
export async function runOnce(runtime: WorkerRuntime): Promise<boolean> {
  const nowMs = Date.now();
  if (nowMs - runtime.lastCleanupAt >= runtime.config.cleanupIntervalMs) {
    runtime.lastCleanupAt = nowMs;
    await cleanupExpiredCvs({
      supabase: runtime.supabase,
      cvStorageDir: runtime.config.cvStorageDir,
      log,
    });
  }

  const deps: ParseDeps = {
    supabase: runtime.supabase,
    ollama: runtime.ollama,
    breaker: runtime.breaker,
    maxAttempts: runtime.config.maxAttempts,
    log,
  };

  if (!runtime.config.aiEnabled) {
    const skipped = await skipAllPendingRuns(deps);
    if (skipped > 0) log("worker.ai_disabled_skipped", { skipped });
    return false;
  }

  if (!runtime.breaker.canAttempt()) {
    const waitMs = runtime.breaker.remainingCooldownMs();
    log("worker.circuit_open", { waitMs });
    await sleep(Math.min(waitMs, 30_000));
    return false;
  }

  const run = await claimRun(deps);
  if (!run) return false;

  await processRun(deps, run);
  return true;
}

export async function main(): Promise<void> {
  const envFile = loadEnvFile([
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ]);

  const config = readConfig();
  const runtime = createRuntime(config);

  log("worker.started", {
    envFile,
    aiEnabled: config.aiEnabled,
    model: config.ollamaModel,
    pollIntervalMs: config.pollIntervalMs,
    maxAttempts: config.maxAttempts,
  });

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("worker.stopping", { signal });
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  // `WORKER_ONCE=true` menjalankan satu iterasi lalu keluar. Berguna untuk
  // pengujian manual dan cron drain, tanpa mengubah perilaku default.
  const runOnceMode = process.env.WORKER_ONCE === "true";

  while (!stopping) {
    try {
      const processed = await runOnce(runtime);
      if (runOnceMode) break;
      if (!processed) {
        await sleep(config.pollIntervalMs);
      }
    } catch (error) {
      log("worker.iteration_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      if (runOnceMode) break;
      await sleep(config.pollIntervalMs);
    }
  }

  log("worker.stopped");
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "fatal",
        event: "worker.crashed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
