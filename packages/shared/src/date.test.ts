import { describe, expect, it } from "vitest";

import {
  getJakartaDayBoundsUtc,
  getYesterdayJakartaDateString,
  shiftDateString,
  toJakartaDateString,
} from "./date";

describe("date helpers (Asia/Jakarta)", () => {
  it("mengonversi timestamp UTC malam menjadi tanggal hari berikutnya di WIB", () => {
    const utcLate = new Date("2026-11-26T18:30:00.000Z"); // 2026-11-27 01:30 WIB
    expect(toJakartaDateString(utcLate)).toBe("2026-11-27");
    expect(getYesterdayJakartaDateString(utcLate)).toBe("2026-11-26");
  });

  it("menghitung batas hari WIB dalam rentang UTC dengan benar", () => {
    const bounds = getJakartaDayBoundsUtc("2026-11-27");
    expect(bounds.startIso).toBe("2026-11-26T17:00:00.000Z");
    expect(bounds.endIso).toBe("2026-11-27T17:00:00.000Z");
  });

  it("menggeser tanggal melintasi akhir bulan", () => {
    expect(shiftDateString("2026-12-01", -1)).toBe("2026-11-30");
  });
});
