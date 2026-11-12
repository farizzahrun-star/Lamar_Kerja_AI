import { describe, expect, it } from "vitest";

import {
  CV_RETENTION_DAYS,
  cvDeleteAfter,
  isAllowedCvMime,
  isResumeTemplate,
} from "./index";

describe("shared domain constants", () => {
  it("mengenali template CV yang valid", () => {
    expect(isResumeTemplate("A")).toBe(true);
    expect(isResumeTemplate("B")).toBe(true);
    expect(isResumeTemplate("C")).toBe(false);
  });

  it("hanya menerima MIME CV yang didukung", () => {
    expect(isAllowedCvMime("application/pdf")).toBe(true);
    expect(
      isAllowedCvMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isAllowedCvMime("image/png")).toBe(false);
  });

  it("menghitung tanggal hapus sesuai masa retensi", () => {
    const from = new Date("2026-11-12T00:00:00.000Z");
    const deleteAfter = cvDeleteAfter(from);

    expect(deleteAfter.toISOString().slice(0, 10)).toBe("2026-12-12");
    expect(CV_RETENTION_DAYS).toBe(30);
  });
});
