import { describe, expect, it } from "vitest";

import {
  createInterestSchema,
  manualJobInputSchema,
  queueApplicationsSchema,
  slugifyInterest,
  updatePreferencesSchema,
} from "./phase2-schemas";

describe("phase2-schemas", () => {
  it("memvalidasi createInterestSchema dan slugifyInterest", () => {
    expect(slugifyInterest("UI/UX Designer")).toBe("ui-ux-designer");
    expect(createInterestSchema.safeParse({ label: "AI Engineer" }).success).toBe(true);
    expect(createInterestSchema.safeParse({ label: "!!!" }).success).toBe(false);
  });

  it("menolak salary_max lebih kecil dari salary_min pada input manual", () => {
    const result = manualJobInputSchema.safeParse({
      mode: "text",
      title: "Backend Developer",
      company: "PT Contoh",
      description: "Membuat layanan REST dan Postgres.",
      salary_min: 15_000_000,
      salary_max: 10_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("memvalidasi updatePreferencesSchema dan batas antrean", () => {
    const prefs = updatePreferencesSchema.safeParse({
      settings: { apply_daily_limit: 12, review_before_send: true },
    });
    expect(prefs.success).toBe(true);

    const invalidQueue = queueApplicationsSchema.safeParse({ jobIds: [] });
    expect(invalidQueue.success).toBe(false);
  });
});
