import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readRunnerConfig } from "./config";
import { cleanupExpiredDebugHtml } from "./debug-storage";
import { computeRandomDelayMs, createFingerprintChecker } from "./limiter";

describe("runner config, limiter, dan debug retention", () => {
  it("membaca konfigurasi runner dengan batas keras 10/platform", () => {
    const cfg = readRunnerConfig({
      RUNNER_SERVER_URL: "http://localhost:3000/",
      RUNNER_TOKEN: "lka_run_1234567890abcdef",
      RUNNER_SCRAPE_LIMIT_PER_PLATFORM: "99",
    });

    expect(cfg.serverUrl).toBe("http://localhost:3000");
    expect(cfg.scrapeLimitPerPlatform).toBe(10);
  });

  it("menghitung delay acak di dalam rentang min..max", () => {
    expect(computeRandomDelayMs(20_000, 45_000, () => 0)).toBe(20_000);
    expect(computeRandomDelayMs(20_000, 45_000, () => 0.99999)).toBe(45_000);
  });

  it("mendeteksi lowongan dikenal lewat external_id, url kanonik, dan raw_hash", () => {
    const checker = createFingerprintChecker({
      externalIds: ["ext-1"],
      canonicalUrls: ["https://glints.com/id/jobs/2"],
      rawHashes: [],
    });

    expect(
      checker.isKnown({
        external_id: "ext-1",
        title: "X",
        company: "Y",
      }),
    ).toBe(true);

    expect(
      checker.isKnown({
        url: "https://glints.com/id/jobs/2?utm_source=test",
        title: "X",
        company: "Y",
      }),
    ).toBe(true);

    checker.remember({ title: "Backend Dev", company: "PT Contoh", location: "Jakarta" });
    expect(
      checker.isKnown({
        title: " backend dev ",
        company: "pt contoh",
        location: "jakarta",
      }),
    ).toBe(true);
  });

  it("menghapus folder HTML debug lebih dari 7 hari", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "lka-runner-debug-"));
    try {
      await mkdir(path.join(tmpDir, "2026-11-10"), { recursive: true });
      await mkdir(path.join(tmpDir, "2026-11-25"), { recursive: true });

      const removed = await cleanupExpiredDebugHtml(tmpDir, new Date("2026-11-27T00:00:00.000Z"));
      expect(removed).toBe(1);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
