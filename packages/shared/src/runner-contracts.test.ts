import { describe, expect, it } from "vitest";

import {
  buildDailySearchPlan,
  runnerJobsSubmissionSchema,
  runnerTaskResultSchema,
} from "./runner-contracts";

describe("runner-contracts", () => {
  it("membagi kuota 10 per platform secara merata antar interest", () => {
    const plan = buildDailySearchPlan({
      date: "2026-11-27",
      enabledPlatforms: ["glints", "jobstreet", "linkedin"],
      interestLabels: ["Backend Developer", "Fullstack Developer", "DevOps Engineer"],
      profileAddresses: ["Bandung, Indonesia", "Jakarta Selatan"],
    });

    expect(plan.platforms).toHaveLength(3);
    for (const plat of plan.platforms) {
      expect(plat.limit).toBe(10);
      const sum = plat.queries.reduce((acc, q) => acc + q.limit, 0);
      expect(sum).toBe(10);
      expect(plat.queries[0]?.location).toBe("Bandung");
      expect(plat.queries[1]?.location).toBe("Jakarta Selatan");
    }
  });

  it("memakai keyword fallback bila belum ada user_interests", () => {
    const plan = buildDailySearchPlan({
      date: "2026-11-27",
      enabledPlatforms: ["glints"],
      interestLabels: [],
    });

    expect(plan.platforms[0]?.queries.length).toBeGreaterThan(0);
    expect(plan.platforms[0]?.queries[0]?.location).toBe("Indonesia");
  });

  it("memvalidasi submission runner jobs dan task result", () => {
    const submission = runnerJobsSubmissionSchema.safeParse({
      platform: "glints",
      run_date: "2026-11-27",
      started_at: "2026-11-27T12:00:00.000Z",
      finished_at: "2026-11-27T12:04:00.000Z",
      found: 3,
      skipped_known: 1,
      blocked: false,
      error_count: 0,
      jobs: [
        {
          platform: "glints",
          external_id: "glints-101",
          title: "Backend Developer",
          company: "PT Contoh",
          url: "https://glints.example.com/jobs/101",
          description: "Kirim CV ke talent@contoh.example.com",
        },
      ],
    });
    expect(submission.success).toBe(true);

    const taskRes = runnerTaskResultSchema.safeParse({
      status: "completed",
      summary: {
        total_found: 3,
        total_new_submitted: 2,
        total_skipped: 1,
        blocked_platforms: [],
      },
    });
    expect(taskRes.success).toBe(true);
  });
});
