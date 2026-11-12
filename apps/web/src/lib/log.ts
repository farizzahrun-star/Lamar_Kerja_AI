/**
 * Logger JSON sederhana dengan redaksi PII.
 *
 * Aturan: jangan pernah mencatat isi CV, prompt/completion LLM, email lengkap,
 * token, atau cookie. Kunci sensitif diganti `"[redacted]"` sebelum output,
 * termasuk pada objek bersarang dan array.
 */

export type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "email",
  "phone",
  "address",
  "fullname",
  "birthdate",
  "textcontent",
  "prompt",
  "completion",
  "sourcesnippet",
] as const;

const REDACTED = "[redacted]";
const MAX_DEPTH = 4;

function isSensitive(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = isSensitive(key) ? REDACTED : redactValue(nested, depth + 1);
  }
  return result;
}

export type LogFields = Record<string, unknown>;

export type LogEntry = LogFields & {
  ts: string;
  level: LogLevel;
  event: string;
};

export function buildLogEntry(level: LogLevel, event: string, fields: LogFields = {}): LogEntry {
  const redacted = redactValue(fields) as LogFields;
  return {
    ts: new Date().toISOString(),
    level,
    event,
    ...redacted,
  };
}

/**
 * Menulis satu baris JSON ke stdout/stderr. Dipakai Route Handlers, Server
 * Actions, dan worker agar log mudah diparse tanpa membocorkan PII.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify(buildLogEntry(level, event, fields));
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
