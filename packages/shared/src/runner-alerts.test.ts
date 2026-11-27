import { describe, expect, it } from "vitest";

import { evaluateRunnerAlerts } from "./runner-alerts";

describe("evaluateRunnerAlerts", () => {
  it("menghasilkan alert bila belum ada run", () => {
    const alerts = evaluateRunnerAlerts([], new Date("2026-11-27T06:00:00.000Z"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.code).toBe("runner_stale");
  });

  it("mendeteksi platform terblokir 3 hari berturut-turut dan runner mati > 48 jam", () => {
    const now = new Date("2026-11-27T12:00:00.000Z");
    const alerts = evaluateRunnerAlerts(
      [
        {
          platform: "linkedin",
          run_date: "2026-11-24",
          started_at: "2026-11-24T10:00:00.000Z",
          finished_at: "2026-11-24T10:05:00.000Z",
          found: 0,
          new_count: 0,
          skipped_known: 0,
          blocked: true,
          error_count: 1,
        },
        {
          platform: "linkedin",
          run_date: "2026-11-23",
          started_at: "2026-11-23T10:00:00.000Z",
          finished_at: "2026-11-23T10:05:00.000Z",
          found: 1,
          new_count: 0,
          skipped_known: 0,
          blocked: true,
          error_count: 1,
        },
        {
          platform: "linkedin",
          run_date: "2026-11-22",
          started_at: "2026-11-22T10:00:00.000Z",
          finished_at: "2026-11-22T10:05:00.000Z",
          found: 0,
          new_count: 0,
          skipped_known: 0,
          blocked: true,
          error_count: 1,
        },
      ],
      now,
    );

    expect(alerts.some((a) => a.code === "blocked_streak" && a.platform === "linkedin")).toBe(true);
    expect(alerts.some((a) => a.code === "runner_stale")).toBe(true);
  });

  it("mendeteksi success rate < 80% selama 3 hari tanpa blocked", () => {
    const now = new Date("2026-11-27T05:00:00.000Z");
    const alerts = evaluateRunnerAlerts(
      [
        {
          platform: "jobstreet",
          run_date: "2026-11-26",
          started_at: "2026-11-26T12:00:00.000Z",
          finished_at: "2026-11-26T12:05:00.000Z",
          found: 10,
          new_count: 5,
          skipped_known: 2,
          blocked: false,
          error_count: 3,
        },
        {
          platform: "jobstreet",
          run_date: "2026-11-25",
          started_at: "2026-11-25T12:00:00.000Z",
          finished_at: "2026-11-25T12:05:00.000Z",
          found: 10,
          new_count: 4,
          skipped_known: 2,
          blocked: false,
          error_count: 4,
        },
        {
          platform: "jobstreet",
          run_date: "2026-11-24",
          started_at: "2026-11-24T12:00:00.000Z",
          finished_at: "2026-11-24T12:05:00.000Z",
          found: 5,
          new_count: 2,
          skipped_known: 1,
          blocked: false,
          error_count: 2,
        },
      ],
      now,
    );

    expect(alerts).toEqual([
      expect.objectContaining({
        code: "low_success_rate",
        platform: "jobstreet",
      }),
    ]);
  });
});
