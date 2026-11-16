import { describe, expect, it } from "vitest";

import { evaluateUploadRateLimit } from "./rate-limit";

describe("evaluateUploadRateLimit", () => {
  const now = new Date("2026-11-16T10:00:00.000Z").getTime();

  it("mengizinkan unggahan ketika di bawah batas", () => {
    const result = evaluateUploadRateLimit({
      timestamps: ["2026-11-16T09:30:00.000Z", "2026-11-16T09:45:00.000Z"],
      maxUploads: 5,
      nowMs: now,
    });

    expect(result).toEqual({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
  });

  it("mengabaikan unggahan di luar jendela 1 jam", () => {
    const result = evaluateUploadRateLimit({
      timestamps: ["2026-11-16T08:00:00.000Z"],
      maxUploads: 1,
      nowMs: now,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("menolak ketika mencapai batas dan menghitung retryAfterSeconds", () => {
    const result = evaluateUploadRateLimit({
      timestamps: [
        "2026-11-16T09:10:00.000Z",
        "2026-11-16T09:20:00.000Z",
        "2026-11-16T09:50:00.000Z",
      ],
      maxUploads: 3,
      nowMs: now,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(600);
  });
});
