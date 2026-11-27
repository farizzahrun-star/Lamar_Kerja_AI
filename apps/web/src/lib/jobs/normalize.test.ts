import { describe, expect, it } from "vitest";

import { prepareNormalizedJob, resolveManualSnapshotDate } from "./normalize";

describe("prepareNormalizedJob", () => {
  it("membersihkan HTML, menormalkan URL, dan memprioritaskan channel email bila ada HR email", () => {
    const normalized = prepareNormalizedJob({
      title: "  Backend   Developer ",
      company: "PT Awan Sintetis",
      location: "Jakarta",
      description: "<p>Kirim CV ke <b>careers@awan.example.com</b></p>",
      url: "https://glints.com/id/opportunities/jobs/123?utm_source=test",
    });

    expect(normalized.title).toBe("Backend Developer");
    expect(normalized.platform).toBe("glints");
    expect(normalized.url).toBe("https://glints.com/id/opportunities/jobs/123");
    expect(normalized.apply_channel).toBe("email");
    expect(normalized.hr_emails).toEqual([
      { email: "careers@awan.example.com", source: "description" },
    ]);
  });

  it("menggabungkan hr_email eksplisit tanpa duplikasi", () => {
    const normalized = prepareNormalizedJob({
      title: "Data Analyst",
      company: "PT Data Fiktif",
      description: "Hubungi HR@data.example.com untuk detail.",
      hr_email: "hr@data.example.com",
    });

    expect(normalized.hr_emails).toEqual([
      { email: "hr@data.example.com", source: "manual" },
    ]);
  });

  it("memvalidasi format snapshot date", () => {
    expect(resolveManualSnapshotDate("2026-11-26")).toBe("2026-11-26");
    expect(resolveManualSnapshotDate("invalid")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
