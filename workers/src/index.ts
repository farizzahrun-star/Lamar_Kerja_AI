/**
 * Entry point worker Lamar Kerja AI.
 *
 * Menjalankan polling terhadap tabel antrean di Supabase memakai secret key:
 * - `cv.cleanup` (retensi 30 hari / consent dicabut)
 * - `runner.plan` (rencana pencarian harian guest scraping)
 * - `jobs.ingest` (normalisasi, dedupe, snapshot, deteksi channel)
 * - `cv.parse` (ekstraksi CV opsional via Ollama qwen3:4b)
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

import { CircuitBreaker } from "./circuit-breaker";
import { cleanupExpiredCvs } from "./cleanup";
import { readConfig, type WorkerConfig } from "./config";
import { loadEnvFile } from "./env-file";
import { claimIngestBatch, processIngestBatch, type IngestDeps } from "./ingest";
import { createOllamaClient, type OllamaClient } from "./ollama";
import { claimRun, processRun, skipAllPendingRuns, type ParseDeps } from "./parse";
import { ensureDailyRunnerPlan } from "./plan";
import { createWorkerSupabase, type WorkerSupabase } from "./supabase";

export const JOBS = [
  { name: "cv.parse", pollIntervalMs: 5_000 },
  { name: "cv.cleanup", pollIntervalMs: 3_600_000 },
  { name: "runner.plan", pollIntervalMs: 900_000 },
  { name: "jobs.ingest", pollIntervalMs: 5_000 },
] as const;

export interface WorkerRuntime {
  config: WorkerConfig;
  supabase: WorkerSupabase;
  ollama: OllamaClient;
  breaker: CircuitBreaker;
  lastCleanupAt: number;
  lastPlanAt: number;
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
    lastPlanAt: 0,
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

  if (nowMs - runtime.lastPlanAt >= runtime.config.planIntervalMs) {
    runtime.lastPlanAt = nowMs;
    await ensureDailyRunnerPlan({
      supabase: runtime.supabase,
      log,
    });
  }

  let didWork = false;
  const ingestDeps: IngestDeps = {
    supabase: runtime.supabase,
    maxAttempts: runtime.config.maxAttempts,
    log,
  };
  const ingestBatch = await claimIngestBatch(ingestDeps);
  if (ingestBatch) {
    await processIngestBatch(ingestDeps, ingestBatch);
    didWork = true;
  }

  const parseDeps: ParseDeps = {
    supabase: runtime.supabase,
    ollama: runtime.ollama,
    breaker: runtime.breaker,
    maxAttempts: runtime.config.maxAttempts,
    log,
  };

  if (!runtime.config.aiEnabled) {
    const skipped = await skipAllPendingRuns(parseDeps);
    if (skipped > 0) log("worker.ai_disabled_skipped", { skipped });
    return didWork;
  }

  if (!runtime.breaker.canAttempt()) {
    const waitMs = runtime.breaker.remainingCooldownMs();
    log("worker.circuit_open", { waitMs });
    await sleep(Math.min(waitMs, 30_000));
    return didWork;
  }

  const run = await claimRun(parseDeps);
  if (!run) return didWork;

  await processRun(parseDeps, run);
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
