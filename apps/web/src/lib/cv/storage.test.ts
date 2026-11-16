import { describe, expect, it } from "vitest";

import { buildRelativeCvPath, resolveSafeCvPath } from "./storage";

describe("resolveSafeCvPath", () => {
  const base = "./data/cv";
  const user1 = "11111111-1111-1111-1111-111111111111";
  const user2 = "22222222-2222-2222-2222-222222222222";
  const cvId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("mengizinkan path relatif yang valid untuk .pdf dan .docx", () => {
    const pdfPath = buildRelativeCvPath(user1, cvId, "pdf");
    const docxPath = buildRelativeCvPath(user1, cvId, "docx");

    expect(resolveSafeCvPath(base, user1, pdfPath)).not.toBeNull();
    expect(resolveSafeCvPath(base, user1, docxPath)).not.toBeNull();
  });

  it("menolak path traversal dengan ..", () => {
    expect(resolveSafeCvPath(base, user1, `${user1}/../../secret.pdf`)).toBeNull();
    expect(resolveSafeCvPath(base, user1, `../${user1}/${cvId}.pdf`)).toBeNull();
  });

  it("menolak akses ke folder user lain", () => {
    const otherPath = buildRelativeCvPath(user2, cvId, "pdf");
    expect(resolveSafeCvPath(base, user1, otherPath)).toBeNull();
  });

  it("menolak ekstensi selain .pdf dan .docx", () => {
    expect(resolveSafeCvPath(base, user1, `${user1}/${cvId}.exe`)).toBeNull();
    expect(resolveSafeCvPath(base, user1, `${user1}/${cvId}.txt`)).toBeNull();
  });
});
