import { describe, expect, it } from "vitest";

import {
  buildSuggestions,
  coercePartialDate,
  isGroundedSnippet,
  normalizeForGrounding,
} from "./sections";

const CV_TEXT = `Budi Santoso
Senior Software Engineer | Jakarta
budi.santoso@example.com | +62 812-3456-7890
linkedin.com/in/budisantoso

Pengalaman
PT Nusantara Digital — Senior Software Engineer
Maret 2021 - Sekarang
- Memimpin migrasi ke microservices dengan Node.js dan Go
- Menurunkan latensi API 40%

CV Teknologi Prima - Backend Engineer
Januari 2018 - Februari 2021
- Membangun REST API dengan TypeScript

Pendidikan
Universitas Indonesia — S1 Ilmu Komputer
2014 - 2018

Keahlian: TypeScript, Node.js, PostgreSQL, Docker
`;

describe("coercePartialDate", () => {
  it("mengubah berbagai format tanggal parsial ke ISO", () => {
    expect(coercePartialDate("2021-03")).toBe("2021-03-01");
    expect(coercePartialDate("2021")).toBe("2021-01-01");
    expect(coercePartialDate("Maret 2021")).toBe("2021-03-01");
    expect(coercePartialDate("03/2021")).toBe("2021-03-01");
    expect(coercePartialDate("2021-03-15")).toBe("2021-03-15");
  });

  it("menolak nilai tidak valid", () => {
    expect(coercePartialDate("")).toBeNull();
    expect(coercePartialDate(null)).toBeNull();
    expect(coercePartialDate("sekarang")).toBeNull();
    expect(coercePartialDate("1850-01")).toBeNull();
    expect(coercePartialDate("2021-13")).toBeNull();
  });
});

describe("grounding", () => {
  it("menormalkan spasi dan huruf", () => {
    expect(normalizeForGrounding("  Budi   Santoso \n Jakarta ")).toBe("budi santoso jakarta");
  });

  it("menerima snippet yang ada dan menolak halusinasi", () => {
    const normalized = normalizeForGrounding(CV_TEXT);
    expect(isGroundedSnippet("Senior Software Engineer", normalized)).toBe(true);
    expect(isGroundedSnippet("Memimpin migrasi ke microservices dengan Node.js dan Go", normalized)).toBe(
      true,
    );
    expect(isGroundedSnippet("Chief Technology Officer di Google", normalized)).toBe(false);
  });
});

describe("buildSuggestions", () => {
  it("menyaring identity yang tidak grounded dan field duplikat", () => {
    const result = buildSuggestions(
      "identity",
      {
        items: [
          {
            field: "full_name",
            value: "Budi Santoso",
            confidence: 0.98,
            source_snippet: "Budi Santoso",
          },
          {
            field: "headline",
            value: "Senior Software Engineer",
            confidence: 0.9,
            source_snippet: "Senior Software Engineer",
          },
          {
            field: "headline",
            value: "CTO",
            confidence: 0.5,
            source_snippet: "CTO",
          },
        ],
      },
      CV_TEXT,
    );

    expect(result.suggestions).toHaveLength(2);
    expect(result.dropped).toBe(1);
    expect(result.suggestions.map((s) => s.field_path)).toEqual(["full_name", "headline"]);
    expect(result.suggestions[0]?.confidence).toBe(0.98);
  });

  it("menormalkan pengalaman menjadi payload siap merge dan menandai pekerjaan saat ini", () => {
    const result = buildSuggestions(
      "experiences",
      {
        items: [
          {
            company: "PT Nusantara Digital",
            title: "Senior Software Engineer",
            employment_type: null,
            start_date: "Maret 2021",
            end_date: null,
            is_current: true,
            description: null,
            points: [
              "Memimpin migrasi ke microservices dengan Node.js dan Go",
              "Menurunkan latensi API 40%",
            ],
            confidence: 0.92,
            source_snippet: "PT Nusantara Digital — Senior Software Engineer",
          },
          {
            company: "PT Halusinasi",
            title: "CTO",
            confidence: 0.4,
            source_snippet: "PT Halusinasi CTO 2019",
          },
        ],
      },
      CV_TEXT,
    );

    expect(result.dropped).toBe(1);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.field_path).toBe("experiences[0]");
    expect(result.suggestions[0]?.value_json).toMatchObject({
      company: "PT Nusantara Digital",
      title: "Senior Software Engineer",
      start_date: "2021-03-01",
      end_date: null,
      is_current: true,
    });
  });

  it("mengabaikan is_current bila tanggal selesai eksplisit tersedia", () => {
    const result = buildSuggestions(
      "experiences",
      {
        items: [
          {
            company: "CV Teknologi Prima",
            title: "Backend Engineer",
            start_date: "2018-01",
            end_date: "Februari 2021",
            is_current: true,
            confidence: 0.9,
            source_snippet: "CV Teknologi Prima - Backend Engineer",
          },
        ],
      },
      CV_TEXT,
    );

    expect(result.suggestions[0]?.value_json).toMatchObject({
      start_date: "2018-01-01",
      end_date: "2021-02-01",
      is_current: false,
    });
  });

  it("mendeduplikasi skill dan menjaga level hanya bila ada", () => {
    const result = buildSuggestions(
      "skills",
      {
        items: [
          { name: "TypeScript", level: null, confidence: 0.9, source_snippet: "TypeScript" },
          { name: "typescript", level: "advanced", confidence: 0.9, source_snippet: "TypeScript" },
          { name: "Kubernetes", level: null, confidence: 0.9, source_snippet: "Kubernetes" },
        ],
      },
      CV_TEXT,
    );

    expect(result.suggestions).toHaveLength(1);
    expect(result.dropped).toBe(2);
    expect(result.suggestions[0]?.value_json).toEqual({ name: "TypeScript", level: null });
  });

  it("menolak nilai di luar schema", () => {
    expect(() =>
      buildSuggestions(
        "skills",
        { items: [{ name: "Go", level: "expert", confidence: 2, source_snippet: "Go" }] },
        CV_TEXT,
      ),
    ).toThrow();
  });
});
