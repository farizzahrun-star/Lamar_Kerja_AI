import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canonicalizeJobUrl,
  computeJobRawHash,
  detectApplyChannel,
  extractHrEmails,
  inferPlatformFromUrl,
  matchesUserInterests,
  parseJobsCsv,
  sanitizeJobText,
  selectBestApplicationChannel,
  sha256Hex,
} from "./jobs";

describe("sha256Hex & raw_hash", () => {
  it("menghasilkan digest SHA-256 yang identik dengan node:crypto", () => {
    const samples = [
      "",
      "backend engineer|pt awan sintetis|jakarta",
      "Desainer Produk — Jakarta Selatan 🚀",
    ];
    for (const sample of samples) {
      const expected = createHash("sha256").update(sample, "utf8").digest("hex");
      expect(sha256Hex(sample)).toBe(expected);
    }
  });

  it("menormalkan kapital dan spasi pada computeJobRawHash", () => {
    const a = computeJobRawHash({
      title: "  Backend   Developer ",
      company: "PT Awan Sintetis",
      location: "Jakarta",
    });
    const b = computeJobRawHash({
      title: "backend developer",
      company: "pt awan   sintetis",
      location: " jakarta ",
    });
    expect(a).toBe(b);
  });
});

describe("sanitizeJobText", () => {
  it("menghapus script/style/tag HTML dan merapikan whitespace", () => {
    const dirty =
      '<script>alert(1)</script><style>.x{}</style><p>Halo &amp; selamat datang!</p><ul><li>TypeScript</li><li>PostgreSQL</li></ul>';
    expect(sanitizeJobText(dirty)).toBe("Halo & selamat datang!\n\n- TypeScript\n- PostgreSQL");
  });
});

describe("canonicalizeJobUrl & inferPlatformFromUrl", () => {
  it("menghapus parameter tracking dan trailing slash", () => {
    expect(
      canonicalizeJobUrl(
        "https://GLINTS.COM/id/opportunities/jobs/123/?utm_source=ig&fbclid=xyz&page=2",
      ),
    ).toBe("https://glints.com/id/opportunities/jobs/123?page=2");
  });

  it("menolak skema non-http(s)", () => {
    expect(canonicalizeJobUrl("javascript:alert(1)")).toBeNull();
  });

  it("mengenali platform dari domain URL", () => {
    expect(inferPlatformFromUrl("https://glints.com/id/opportunities/jobs/abc")).toBe("glints");
    expect(inferPlatformFromUrl("https://id.jobstreet.com/id/job/999")).toBe("jobstreet");
    expect(inferPlatformFromUrl("https://www.linkedin.com/jobs/view/123")).toBe("linkedin");
    expect(inferPlatformFromUrl("https://karir.contoh-perusahaan.example.com/be")).toBe("manual");
  });
});

describe("extractHrEmails & channel detection", () => {
  it("mengekstrak email HR valid dan mengabaikan noreply", () => {
    const text =
      "Jangan balas ke noreply@example.com. Kirim CV Anda ke Talent@Contoh.co.id atau careers@contoh.co.id (dan cc talent@contoh.co.id).";
    expect(extractHrEmails(text)).toEqual(["talent@contoh.co.id", "careers@contoh.co.id"]);
  });

  it("mengutamakan email saat mendeteksi apply_channel", () => {
    expect(
      detectApplyChannel({
        hrEmails: ["hr@contoh.example.com"],
        platform: "glints",
        url: "https://glints.com/id/jobs/1",
      }),
    ).toBe("email");
    expect(selectBestApplicationChannel(["link", "portal", "easy_apply"], false)).toBe(
      "easy_apply",
    );
    expect(selectBestApplicationChannel(["link", "portal"], true)).toBe("email");
  });
});

describe("matchesUserInterests", () => {
  it("mencocokkan frasa penuh maupun kombinasi kata kunci non-generik", () => {
    expect(
      matchesUserInterests(
        {
          title: "Senior Backend Engineer (Go & PostgreSQL)",
          description: "Merancang microservice API.",
        },
        ["Backend Developer"],
      ),
    ).toBe(true);

    expect(
      matchesUserInterests(
        {
          title: "HR Recruitment Specialist",
          description: "Mengelola wawancara kandidat.",
        },
        ["Backend Developer"],
      ),
    ).toBe(false);
  });
});

describe("parseJobsCsv", () => {
  it("mem-parse CSV dengan kutip dan melaporkan baris tanpa title/company", () => {
    const csv = [
      "title,company,location,work_mode,description,url,posted_at,hr_email",
      '"Backend Developer, Senior","PT Awan, Tbk",Jakarta,hybrid,"Membangun API dengan ""TypeScript"".",https://contoh.example.com/1,2026-11-26,hr@awan.example.com',
      ",PT Tanpa Judul,Bandung,remote,Deskripsi,,2026-11-26,",
    ].join("\n");

    const parsed = parseJobsCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.title).toBe("Backend Developer, Senior");
    expect(parsed.rows[0]?.company).toBe("PT Awan, Tbk");
    expect(parsed.rows[0]?.hr_email).toBe("hr@awan.example.com");
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]?.rowNumber).toBe(3);
  });
});
