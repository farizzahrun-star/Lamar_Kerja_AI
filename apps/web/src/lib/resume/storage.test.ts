import { describe, expect, it } from "vitest";

import { buildRelativeResumePath, resolveSafeResumePath } from "./storage";

describe("resolveSafeResumePath", () => {
  const base = "./data/resumes";
  const user1 = "11111111-1111-1111-1111-111111111111";
  const user2 = "22222222-2222-2222-2222-222222222222";
  const resumeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("mengizinkan path relatif milik user yang sama", () => {
    const rel = buildRelativeResumePath(user1, resumeId);
    const resolved = resolveSafeResumePath(base, user1, rel);

    expect(resolved).not.toBeNull();
    expect(resolved).toContain(user1);
  });

  it("menolak path traversal dengan ..", () => {
    expect(resolveSafeResumePath(base, user1, `${user1}/../../secret.pdf`)).toBeNull();
    expect(resolveSafeResumePath(base, user1, `../${user1}/${resumeId}.pdf`)).toBeNull();
  });

  it("menolak akses ke direktori user lain", () => {
    const otherRel = buildRelativeResumePath(user2, resumeId);
    expect(resolveSafeResumePath(base, user1, otherRel)).toBeNull();
  });

  it("menolak ekstensi selain .pdf", () => {
    expect(resolveSafeResumePath(base, user1, `${user1}/${resumeId}.txt`)).toBeNull();
  });
});
