import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Parser `.env` minimalis (tanpa dependency) untuk worker yang dijalankan di
 * luar Next.js. Mendukung komentar `#`, nilai berkutip, dan `export `.
 * Variabel yang sudah ada di `process.env` tidak ditimpa.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Memuat `.env` dari daftar kandidat pertama yang ada. Mengembalikan path yang
 * dipakai (atau null) agar entry point dapat mencatatnya ke log.
 */
export function loadEnvFile(
  candidates: string[],
  target: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const candidate of candidates) {
    const absolute = path.resolve(candidate);
    if (!existsSync(absolute)) continue;

    const parsed = parseEnvFile(readFileSync(absolute, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (target[key] === undefined || target[key] === "") {
        target[key] = value;
      }
    }

    return absolute;
  }

  return null;
}
