/**
 * Entry point worker Lamar Kerja AI.
 *
 * Phase 1 hanya membutuhkan satu job: `cv.parse` (M3). Worker berjalan sebagai
 * proses terpisah yang polling tabel antrean di Supabase memakai secret key,
 * jadi tidak butuh koneksi `DATABASE_URL` langsung.
 *
 * Untuk M0 file ini sengaja hanya menyediakan kerangka: daftar job dan guard
 * konfigurasi. Implementasi loop menyusul di M3 saat tabel `cv_parse_runs`
 * sudah dipakai.
 */

export type WorkerJobName = "cv.parse";

export interface WorkerJob {
  name: WorkerJobName;
  /** Interval polling dalam milidetik saat antrean kosong. */
  pollIntervalMs: number;
}

export const JOBS: readonly WorkerJob[] = [{ name: "cv.parse", pollIntervalMs: 5_000 }];

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  aiEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
}

/**
 * Membaca konfigurasi dari environment. Sengaja tidak memakai zod agar
 * package ini tetap ringan; validasi detail menyusul bersama implementasi job.
 */
export function readConfig(source: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const supabaseUrl = source.SUPABASE_URL;
  const supabaseSecretKey = source.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("SUPABASE_URL dan SUPABASE_SECRET_KEY wajib diisi untuk worker.");
  }

  return {
    supabaseUrl,
    supabaseSecretKey,
    aiEnabled: source.AI_ENABLED !== "false",
    ollamaBaseUrl: source.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaModel: source.OLLAMA_MODEL ?? "qwen3:4b",
  };
}
