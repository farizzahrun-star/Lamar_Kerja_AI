import { describe, expect, it } from "vitest";

import {
  computeSha256,
  detectCvBufferType,
  sanitizeFilename,
  validateCvBuffer,
} from "./validation";

describe("validation cv", () => {
  const fakePdf = Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.from("sample pdf content for test"),
  ]);

  const fakeDocx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("dummy-entry-word/document.xml-content"),
  ]);

  const fakeZipNotDocx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("dummy-entry-photos/vacation.jpg"),
  ]);

  it("mendeteksi tipe berkas berdasarkan magic bytes", () => {
    expect(detectCvBufferType(fakePdf)?.extension).toBe("pdf");
    expect(detectCvBufferType(fakeDocx)?.extension).toBe("docx");
    expect(detectCvBufferType(fakeZipNotDocx)).toBeNull();
    expect(detectCvBufferType(Buffer.from("plain text file"))).toBeNull();
  });

  it("menghitung sha256 secara deterministik", () => {
    const hash = computeSha256(fakePdf);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(computeSha256(fakePdf)).toBe(hash);
  });

  it("membersihkan nama file yang tidak aman", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFilename("CV saya (final) v2.pdf")).toBe("CV saya (final) v2.pdf");
    expect(sanitizeFilename("")).toBe("cv-dokumen");
  });

  it("memvalidasi berkas kosong atau format tidak didukung", () => {
    expect(validateCvBuffer(Buffer.alloc(0)).ok).toBe(false);

    const badType = validateCvBuffer(Buffer.from("halo dunia"));
    expect(badType.ok).toBe(false);
    if (!badType.ok) {
      expect(badType.code).toBe("UNSUPPORTED_TYPE");
    }

    const valid = validateCvBuffer(fakePdf, "cv.pdf");
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.extension).toBe("pdf");
      expect(valid.mime).toBe("application/pdf");
      expect(valid.sizeBytes).toBe(fakePdf.length);
    }
  });
});
