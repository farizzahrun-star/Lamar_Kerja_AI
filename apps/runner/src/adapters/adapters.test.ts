import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  isGlintsBlocked,
  parseGlintsDetailHtml,
  parseGlintsSearchHtml,
} from "./glints";
import {
  isJobstreetBlocked,
  parseJobstreetDetailHtml,
  parseJobstreetSearchHtml,
} from "./jobstreet";
import {
  isLinkedinBlocked,
  parseLinkedinDetailHtml,
  parseLinkedinSearchHtml,
} from "./linkedin";

const FIXTURES_DIR = path.resolve(__dirname, "__fixtures__");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

describe("adapter Glints (fixture HTML)", () => {
  it("mengekstrak daftar kartu lowongan dan detail lowongan", () => {
    const cards = parseGlintsSearchHtml(readFixture("glints-search.html"));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      platform: "glints",
      external_id: "glints-101",
      title: "Backend Developer (TypeScript)",
      company: "PT Awan Sintetis",
      work_mode: "hybrid",
    });

    const detail = parseGlintsDetailHtml(readFixture("glints-detail.html"), cards[0]!);
    expect(detail.title).toBe("Backend Developer (TypeScript)");
    expect(detail.salary_min).toBe(14_000_000);
    expect(detail.salary_max).toBe(20_000_000);
    expect(detail.apply_channel).toBe("easy_apply");
    expect(detail.description).toContain("careers@awan-sintetis.example.com");
  });

  it("mendeteksi halaman login / challenge sebagai blocked", () => {
    expect(
      isGlintsBlocked({
        status: 403,
        url: "https://glints.com/id/opportunities/jobs/explore",
        html: "<html>cf-challenge</html>",
      }).blocked,
    ).toBe(true);
  });
});

describe("adapter Jobstreet (fixture HTML)", () => {
  it("mengekstrak kartu, deskripsi, mode kerja, dan rentang gaji", () => {
    const cards = parseJobstreetSearchHtml(readFixture("jobstreet-search.html"));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      platform: "jobstreet",
      external_id: "88001234",
      title: "Fullstack Engineer",
      company: "PT Logistik Fiktif",
      work_mode: "remote",
    });

    const detail = parseJobstreetDetailHtml(readFixture("jobstreet-detail.html"), cards[0]!);
    expect(detail.salary_min).toBe(12_000_000);
    expect(detail.salary_max).toBe(18_000_000);
    expect(detail.apply_channel).toBe("easy_apply");
    expect(detail.work_mode).toBe("remote");
  });

  it("mendeteksi HTTP 429 dan authwall Seek", () => {
    expect(
      isJobstreetBlocked({
        status: 429,
        url: "https://id.jobstreet.com/id/jobs",
        html: "<html>Too many requests</html>",
      }).blocked,
    ).toBe(true);
    expect(
      isJobstreetBlocked({
        status: 200,
        url: "https://login.seek.com/authorize",
        html: "<html>Sign in</html>",
      }).blocked,
    ).toBe(true);
  });
});

describe("adapter LinkedIn (fixture HTML)", () => {
  it("mengekstrak kartu publik dan detail lowongan tanpa login", () => {
    const cards = parseLinkedinSearchHtml(readFixture("linkedin-search.html"));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      platform: "linkedin",
      external_id: "3999112233",
      title: "Software Engineer (Go & Postgres)",
      company: "Studio Kode Contoh",
      work_mode: "hybrid",
    });

    const detail = parseLinkedinDetailHtml(readFixture("linkedin-detail.html"), cards[0]!);
    expect(detail.salary_min).toBe(15_000_000);
    expect(detail.salary_max).toBe(22_000_000);
    expect(detail.apply_channel).toBe("easy_apply");
    expect(detail.description).toContain("PostgreSQL");
  });

  it("mendeteksi authwall LinkedIn", () => {
    expect(
      isLinkedinBlocked({
        status: 200,
        url: "https://www.linkedin.com/authwall?trk=gf",
        html: "<html>Sign in to view more jobs</html>",
      }).blocked,
    ).toBe(true);
  });
});
