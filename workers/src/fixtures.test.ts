import { describe, expect, it } from "vitest";
import {
  certificationSchema,
  educationSchema,
  experienceSchema,
  identitySchema,
  languageSchema,
  manualJobInputSchema,
  skillSchema,
} from "@lamarkerja/shared";

import {
  SYNTHETIC_CERTIFICATIONS,
  SYNTHETIC_CV_TEXT,
  SYNTHETIC_EDUCATIONS,
  SYNTHETIC_EXPERIENCES,
  SYNTHETIC_JOBS,
  SYNTHETIC_LANGUAGES,
  SYNTHETIC_PENDING_SUGGESTIONS,
  SYNTHETIC_PROFILE,
  SYNTHETIC_SKILLS,
} from "./fixtures";
import { isGroundedSnippet, normalizeForGrounding } from "./sections";

describe("fixtures sintetis", () => {
  it("lolos seluruh schema profil dan tidak mengandung domain nyata", () => {
    expect(() => identitySchema.parse(SYNTHETIC_PROFILE)).not.toThrow();

    for (const edu of SYNTHETIC_EDUCATIONS) {
      expect(() => educationSchema.parse(edu)).not.toThrow();
    }
    for (const exp of SYNTHETIC_EXPERIENCES) {
      expect(() => experienceSchema.parse(exp)).not.toThrow();
    }
    for (const skill of SYNTHETIC_SKILLS) {
      expect(() => skillSchema.parse(skill)).not.toThrow();
    }
    for (const cert of SYNTHETIC_CERTIFICATIONS) {
      expect(() => certificationSchema.parse(cert)).not.toThrow();
    }
    for (const lang of SYNTHETIC_LANGUAGES) {
      expect(() => languageSchema.parse(lang)).not.toThrow();
    }
  });

  it("saran pending benar-benar grounded pada teks CV sintetis", () => {
    const normalized = normalizeForGrounding(SYNTHETIC_CV_TEXT);
    for (const item of SYNTHETIC_PENDING_SUGGESTIONS) {
      expect(isGroundedSnippet(item.source_snippet, normalized)).toBe(true);
    }
  });

  it("fixture lowongan Phase 2 valid dan memakai domain contoh", () => {
    expect(SYNTHETIC_JOBS.length).toBeGreaterThanOrEqual(8);
    for (const job of SYNTHETIC_JOBS) {
      expect(job.url).toContain("example.com");
      expect(() =>
        manualJobInputSchema.parse({
          mode: "url",
          url: job.url,
          platform: job.platform,
          title: job.title,
          company: job.company,
          location: job.location,
          work_mode: job.work_mode,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          description: job.description,
          posted_at: null,
          hr_email: null,
        }),
      ).not.toThrow();
    }
  });
});
