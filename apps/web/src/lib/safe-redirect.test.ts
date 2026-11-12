import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("mengizinkan path internal", () => {
    expect(safeNextPath("/profile")).toBe("/profile");
    expect(safeNextPath("/onboarding?step=identity")).toBe("/onboarding?step=identity");
  });

  it("menolak URL absolut dan protocol-relative", () => {
    expect(safeNextPath("https://evil.example.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.example.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example.com")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });

  it("memakai fallback kustom", () => {
    expect(safeNextPath(undefined, "/login")).toBe("/login");
  });
});
