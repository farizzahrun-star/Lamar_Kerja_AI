import { describe, expect, it } from "vitest";

import { evaluateConsentRecord, hashUserAgent, type MinimalConsentRecord } from "./consent-core";

const BASE_RECORD: MinimalConsentRecord = {
  id: "10000000-0000-0000-0000-000000000001",
  kind: "cv_ai_processing",
  version: "2026-11-06.v1",
  accepted_at: "2026-11-12T00:00:00.000Z",
  revoked_at: null,
};

describe("evaluateConsentRecord", () => {
  it("menolak jika consent belum pernah diberikan (missing)", () => {
    const result = evaluateConsentRecord(null, "2026-11-06.v1");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing");
  });

  it("menolak jika consent sudah dicabut (revoked)", () => {
    const result = evaluateConsentRecord(
      { ...BASE_RECORD, revoked_at: "2026-11-12T01:00:00.000Z" },
      "2026-11-06.v1",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("revoked");
  });

  it("menolak jika versi consent lebih lama dari versi wajib (outdated)", () => {
    const result = evaluateConsentRecord(
      { ...BASE_RECORD, version: "2026-01-01.v0" },
      "2026-11-06.v1",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("outdated");
  });

  it("menerima consent aktif dengan versi yang cocok", () => {
    const result = evaluateConsentRecord(BASE_RECORD, "2026-11-06.v1");
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("ok");
  });
});

describe("hashUserAgent", () => {
  it("mengembalikan null untuk user-agent kosong dan sha256 64-hex untuk nilai valid", () => {
    expect(hashUserAgent(null)).toBeNull();
    expect(hashUserAgent("   ")).toBeNull();

    const digest = hashUserAgent("Mozilla/5.0 TestBrowser");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
});
