import { describe, expect, it } from "vitest";

import { canCancelApplication, evaluateQueueRequest } from "./core";

describe("applications queue core rules", () => {
  const j1 = "11111111-1111-4111-8111-111111111111";
  const j2 = "22222222-2222-4222-8222-222222222222";
  const j3 = "33333333-3333-4333-8333-333333333333";

  it("menolak lowongan yang masih aktif/pernah dilamar, tetapi mengizinkan status cancelled", () => {
    const blocked = evaluateQueueRequest({
      requestedJobIds: [j1, j2],
      existingApplications: [{ job_id: j1, status: "queued" }],
      todayCount: 0,
      dailyLimit: 10,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.status).toBe(409);
      expect(blocked.code).toBe("ALREADY_APPLIED");
    }

    const allowedCancelled = evaluateQueueRequest({
      requestedJobIds: [j1],
      existingApplications: [{ job_id: j1, status: "cancelled" }],
      todayCount: 0,
      dailyLimit: 10,
    });
    expect(allowedCancelled).toEqual({ ok: true, uniqueJobIds: [j1] });
  });

  it("menolak batch secara atomik jika melebihi sisa kuota harian", () => {
    const result = evaluateQueueRequest({
      requestedJobIds: [j1, j2, j3],
      existingApplications: [],
      todayCount: 8,
      dailyLimit: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe("DAILY_LIMIT_REACHED");
    }
  });

  it("mendeduplikasi ID lowongan ganda dalam satu request", () => {
    const result = evaluateQueueRequest({
      requestedJobIds: [j1, j1, j2],
      existingApplications: [],
      todayCount: 0,
      dailyLimit: 10,
    });
    expect(result).toEqual({ ok: true, uniqueJobIds: [j1, j2] });
  });

  it("hanya mengizinkan pembatalan saat status queued", () => {
    expect(canCancelApplication("queued")).toBe(true);
    expect(canCancelApplication("preparing")).toBe(false);
    expect(canCancelApplication("sending")).toBe(false);
    expect(canCancelApplication("sent")).toBe(false);
    expect(canCancelApplication("cancelled")).toBe(false);
  });
});
