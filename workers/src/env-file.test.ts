import { describe, expect, it } from "vitest";

import { loadEnvFile, parseEnvFile } from "./env-file";

describe("parseEnvFile", () => {
  it("mengabaikan komentar, baris kosong, dan mendukung export serta kutip", () => {
    const parsed = parseEnvFile(
      [
        "# komentar",
        "",
        "SUPABASE_URL=https://example.supabase.co",
        "export AI_ENABLED=false",
        'OLLAMA_MODEL="qwen3:4b"',
        "QUOTED='hello world'",
        "1INVALID=nope",
        "NO_EQUALS",
      ].join("\n"),
    );

    expect(parsed).toEqual({
      SUPABASE_URL: "https://example.supabase.co",
      AI_ENABLED: "false",
      OLLAMA_MODEL: "qwen3:4b",
      QUOTED: "hello world",
    });
  });
});

describe("loadEnvFile", () => {
  it("mengembalikan null bila tidak ada kandidat yang ada", () => {
    expect(loadEnvFile(["./tidak-ada-file-ini.env"], {})).toBeNull();
  });

  it("memuat file pertama yang ada tanpa menimpa variabel yang sudah diset", () => {
    const target: NodeJS.ProcessEnv = { EXISTING: "keep" };
    const loaded = loadEnvFile(["./.env.example", "./.env"], target);

    expect(loaded).not.toBeNull();
    expect(target.EXISTING).toBe("keep");
    expect(target.SUPABASE_URL).toBeDefined();
  });
});
