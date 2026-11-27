export interface WorkerConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  aiEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaNumCtx: number;
  ollamaTimeoutMs: number;
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  cvStorageDir: string;
  cleanupIntervalMs: number;
  planIntervalMs: number;
}

function readInt(
  source: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const raw = source[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Membaca konfigurasi worker dari environment. Nilai default mengikuti
 * `.env.example` sehingga worker tetap bisa dijalankan untuk pengujian lokal.
 */
export function readConfig(source: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const supabaseUrl = source.SUPABASE_URL?.trim();
  const supabaseSecretKey = source.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("SUPABASE_URL dan SUPABASE_SECRET_KEY wajib diisi untuk worker.");
  }

  const ollamaBaseUrl = (source.OLLAMA_BASE_URL ?? "http://localhost:11434").trim();
  if (!/^https?:\/\//.test(ollamaBaseUrl)) {
    throw new Error("OLLAMA_BASE_URL harus berupa URL http(s) yang valid.");
  }

  return {
    supabaseUrl,
    supabaseSecretKey,
    aiEnabled: source.AI_ENABLED !== "false",
    ollamaBaseUrl: ollamaBaseUrl.replace(/\/+$/, ""),
    ollamaModel: (source.OLLAMA_MODEL ?? "qwen3:4b").trim() || "qwen3:4b",
    ollamaNumCtx: readInt(source, "OLLAMA_NUM_CTX", 8192, { min: 1024 }),
    ollamaTimeoutMs: readInt(source, "OLLAMA_TIMEOUT_MS", 180_000, { min: 5_000 }),
    pollIntervalMs: readInt(source, "WORKER_POLL_INTERVAL_MS", 5_000, { min: 250 }),
    batchSize: readInt(source, "WORKER_BATCH_SIZE", 3, { min: 1, max: 20 }),
    maxAttempts: readInt(source, "WORKER_MAX_ATTEMPTS", 2, { min: 1, max: 5 }),
    cvStorageDir: (source.CV_STORAGE_DIR ?? "./data/cv").trim() || "./data/cv",
    cleanupIntervalMs: readInt(source, "WORKER_CLEANUP_INTERVAL_MS", 3_600_000, { min: 1_000 }),
    planIntervalMs: readInt(source, "WORKER_PLAN_INTERVAL_MS", 900_000, { min: 5_000 }),
  };
}
