import path from "node:path";
import { pathToFileURL } from "node:url";

import { createRunnerApiClient } from "./client";
import { readRunnerConfig } from "./config";
import { loadEnvFile } from "./env-file";
import { runDailyScrape } from "./run-daily";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const log = (event: string, data?: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

export async function main(): Promise<void> {
  const envFile = loadEnvFile([
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ]);

  const config = readRunnerConfig();
  const client = createRunnerApiClient({
    serverUrl: config.serverUrl,
    runnerToken: config.runnerToken,
  });

  const once = process.argv.includes("--once") || process.env.RUNNER_ONCE === "true";
  const forcePull = process.argv.includes("--force");

  log("runner.started", {
    envFile,
    serverUrl: config.serverUrl,
    once,
    headless: config.headless,
    limitPerPlatform: config.scrapeLimitPerPlatform,
  });

  if (once) {
    const outcome = await runDailyScrape({ config, client, forcePull, log });
    log("runner.daily_done", { ...outcome });
    return;
  }

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("runner.stopping", { signal });
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  while (!stopping) {
    try {
      const outcome = await runDailyScrape({ config, client, forcePull, log });
      log("runner.cycle_done", { ...outcome });
    } catch (error) {
      log("runner.cycle_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!stopping) {
      await sleep(config.pollIntervalMs);
    }
  }

  log("runner.stopped");
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
        event: "runner.crashed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
