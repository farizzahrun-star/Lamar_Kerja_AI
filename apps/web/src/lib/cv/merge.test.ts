import { describe, expect, it } from "vitest";

import {
  acceptedSuggestionIds,
  invalidSuggestionIds,
  normalizeIdentityValue,
  planMerges,
  type MergeSuggestionInput,
  type MergeableBundle,
} from "./merge";

function emptyBundle(): MergeableBundle {
  return { experiences: [], educations: [], skills: [] };
}

function suggestion(
  id: string,
  section: MergeSuggestionInput["section"],
  field_path: string,
  value_json: unknown,
): MergeSuggestionInput {
  return { id, section, field_path, value_json };
}

const EXPERIENCE = {
  company: "PT Nusantara Digital",
  title: "Senior Software Engineer",
  employment_type: null,
  start_date: "2021-03-01",
  end_date: null,
  is_current: true,
  description: null,
  points: ["Memimpin migrasi ke microservices"],
};

const EDUCATION = {
  institution: "Universitas Indonesia",
  level: "S1",
  major: "Ilmu Komputer",
  gpa: 3.5,
  start_year: 2014,
  end_year: 2018,
};

describe("normalizeIdentityValue", () => {
  it("menambahkan https:// pada URL tanpa skema", () => {
    expect(normalizeIdentityValue("linkedin_url", "linkedin.com/in/budi")).toBe(
      "https://linkedin.com/in/budi",
    );
    expect(normalizeIdentityValue("portfolio_url", "https://github.com/budi")).toBe(
      "https://github.com/budi",
    );
  });

  it("mengembalikan null untuk nilai kosong atau bukan string", () => {
    expect(normalizeIdentityValue("full_name", "   ")).toBeNull();
    expect(normalizeIdentityValue("phone", 123)).toBeNull();
  });
});

describe("planMerges", () => {
  it("menyusun patch identitas dan menolak nilai yang tidak valid", () => {
    const plan = planMerges(emptyBundle(), [
      suggestion("s1", "identity", "full_name", "Budi Santoso"),
      suggestion("s2", "identity", "headline", "Senior Software Engineer"),
      suggestion("s3", "identity", "full_name", "Budi Lain"),
      suggestion("s4", "identity", "phone", "  "),
      suggestion("s5", "identity", "linkedin_url", "linkedin.com/in/budi"),
    ]);

    expect(plan.identity.patch).toEqual({
      full_name: "Budi Santoso",
      headline: "Senior Software Engineer",
      linkedin_url: "https://linkedin.com/in/budi",
    });
    expect(plan.identity.fields).toEqual(["full_name", "headline", "linkedin_url"]);

    const byId = new Map(plan.decisions.map((d) => [d.id, d]));
    expect(byId.get("s1")?.disposition).toBe("applied");
    expect(byId.get("s3")?.disposition).toBe("duplicate");
    expect(byId.get("s4")?.disposition).toBe("invalid");
    expect(byId.get("s5")?.disposition).toBe("applied");
  });

  it("menandai identitas yang sudah sama dengan profil sebagai duplikat", () => {
    const bundle: MergeableBundle = {
      ...emptyBundle(),
      profile: { full_name: "Budi Santoso" } as MergeableBundle["profile"],
    };

    const plan = planMerges(bundle, [
      suggestion("i1", "identity", "full_name", "  budi santoso "),
      suggestion("i2", "identity", "headline", "Backend Engineer"),
    ]);

    const byId = new Map(plan.decisions.map((d) => [d.id, d]));
    expect(byId.get("i1")?.disposition).toBe("duplicate");
    expect(byId.get("i2")?.disposition).toBe("applied");
    expect(plan.identity.patch).toEqual({ headline: "Backend Engineer" });
  });

  it("mendeduplikasi pengalaman terhadap profil dan batch yang sama", () => {
    const bundle: MergeableBundle = {
      ...emptyBundle(),
      experiences: [
        {
          company: "PT Nusantara Digital",
          title: "Senior Software Engineer",
          start_date: "2021-03-01",
        } as MergeableBundle["experiences"][number],
      ],
    };

    const plan = planMerges(bundle, [
      suggestion("e1", "experiences", "experiences[0]", EXPERIENCE),
      suggestion("e2", "experiences", "experiences[1]", {
        ...EXPERIENCE,
        company: "  pt nusantara digital ",
        title: "SENIOR SOFTWARE ENGINEER",
      }),
      suggestion("e3", "experiences", "experiences[2]", {
        ...EXPERIENCE,
        company: "CV Teknologi Prima",
      }),
    ]);

    expect(plan.experiences).toHaveLength(1);
    expect(plan.experiences[0]?.id).toBe("e3");

    const byId = new Map(plan.decisions.map((d) => [d.id, d]));
    expect(byId.get("e1")?.disposition).toBe("duplicate");
    expect(byId.get("e2")?.disposition).toBe("duplicate");
    expect(byId.get("e3")?.disposition).toBe("applied");
  });

  it("mendeduplikasi pendidikan dan skill secara case-insensitive", () => {
    const bundle: MergeableBundle = {
      ...emptyBundle(),
      educations: [
        {
          institution: "Universitas Indonesia",
          level: "S1",
          start_year: 2014,
        } as MergeableBundle["educations"][number],
      ],
      skills: [{ name: "TypeScript" } as MergeableBundle["skills"][number]],
    };

    const plan = planMerges(bundle, [
      suggestion("d1", "educations", "educations[0]", EDUCATION),
      suggestion("d2", "educations", "educations[1]", {
        ...EDUCATION,
        institution: "universitas indonesia",
        major: "Sistem Informasi",
      }),
      suggestion("d3", "educations", "educations[2]", {
        ...EDUCATION,
        institution: "Institut Teknologi Bandung",
      }),
      suggestion("k1", "skills", "skills[0]", { name: "typescript", level: null }),
      suggestion("k2", "skills", "skills[1]", { name: "PostgreSQL", level: "advanced" }),
    ]);

    expect(plan.educations).toHaveLength(1);
    expect(plan.educations[0]?.id).toBe("d3");
    expect(plan.skills).toHaveLength(1);
    expect(plan.skills[0]?.id).toBe("k2");

    const byId = new Map(plan.decisions.map((d) => [d.id, d]));
    expect(byId.get("d1")?.disposition).toBe("duplicate");
    expect(byId.get("d2")?.disposition).toBe("duplicate");
    expect(byId.get("k1")?.disposition).toBe("duplicate");
  });

  it("menolak payload di luar schema tanpa menghentikan batch", () => {
    const plan = planMerges(emptyBundle(), [
      suggestion("x1", "experiences", "experiences[0]", { company: "" }),
      suggestion("x2", "skills", "skills[0]", { name: "Go", level: "expert" }),
      suggestion("x3", "skills", "skills[1]", { name: "Go", level: null }),
    ]);

    const byId = new Map(plan.decisions.map((d) => [d.id, d]));
    expect(byId.get("x1")?.disposition).toBe("invalid");
    expect(byId.get("x2")?.disposition).toBe("invalid");
    expect(byId.get("x3")?.disposition).toBe("applied");
    expect(plan.skills).toHaveLength(1);
  });

  it("memisahkan ID yang diterima dan yang tidak valid", () => {
    const plan = planMerges(emptyBundle(), [
      suggestion("a", "skills", "skills[0]", { name: "Go", level: null }),
      suggestion("b", "skills", "skills[1]", { name: "Go", level: null }),
      suggestion("c", "skills", "skills[2]", { name: "", level: null }),
    ]);

    expect(acceptedSuggestionIds(plan).sort()).toEqual(["a", "b"]);
    expect(invalidSuggestionIds(plan)).toEqual(["c"]);
  });
});
