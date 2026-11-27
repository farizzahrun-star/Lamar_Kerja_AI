import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Memuat pasangan `KEY=VALUE` dari `.env` tanpa menimpa variable environment
 * yang sudah diset dari shell.
 */
export function loadEnvFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!existsSync(resolved)) continue;

    const content = readFileSync(resolved, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;

      const key = line.slice(0, eqIndex).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }

    return resolved;
  }

  return null;
}
