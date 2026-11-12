import { describe, expect, it } from "vitest";

import { buildLogEntry, redactValue } from "./log";

describe("redaksi log", () => {
  it("menyembunyikan kunci sensitif pada objek bersarang", () => {
    const result = redactValue({
      userId: "u-1",
      email: "rahasia@example.com",
      nested: { password: "hunter2", access_token: "abc" },
      items: [{ phone: "0812" }, { skill: "TypeScript" }],
    }) as Record<string, unknown>;

    expect(result.userId).toBe("u-1");
    expect(result.email).toBe("[redacted]");
    expect(result.nested).toEqual({ password: "[redacted]", access_token: "[redacted]" });
    expect(result.items).toEqual([{ phone: "[redacted]" }, { skill: "TypeScript" }]);
  });

  it("mengenali variasi penulisan kunci", () => {
    const result = redactValue({
      fullName: "Nama",
      full_name: "Nama",
      SUPABASE_SECRET_KEY: "sb_secret_x",
      textContent: "isi cv",
    }) as Record<string, unknown>;

    expect(result.fullName).toBe("[redacted]");
    expect(result.full_name).toBe("[redacted]");
    expect(result.SUPABASE_SECRET_KEY).toBe("[redacted]");
    expect(result.textContent).toBe("[redacted]");
  });

  it("membangun entri log dengan metadata", () => {
    const entry = buildLogEntry("info", "cv.upload", { userId: "u-1", email: "a@b.c" });

    expect(entry.level).toBe("info");
    expect(entry.event).toBe("cv.upload");
    expect(entry.userId).toBe("u-1");
    expect(entry.email).toBe("[redacted]");
    expect(typeof entry.ts).toBe("string");
  });
});
