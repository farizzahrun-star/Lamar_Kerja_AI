export const CV_UPLOAD_WINDOW_MS = 3_600_000;

export interface UploadRateLimitInput {
  timestamps: readonly string[];
  maxUploads: number;
  windowMs?: number;
  nowMs?: number;
}

export interface UploadRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Mengevaluasi batas unggah CV per user dalam jendela waktu bergulir (default
 * 1 jam). `timestamps` adalah daftar `created_at` (ISO) milik user di dalam
 * jendela waktu tersebut.
 */
export function evaluateUploadRateLimit(input: UploadRateLimitInput): UploadRateLimitResult {
  const windowMs = input.windowMs ?? CV_UPLOAD_WINDOW_MS;
  const nowMs = input.nowMs ?? Date.now();
  const cutoff = nowMs - windowMs;

  const recent = input.timestamps
    .map((iso) => new Date(iso).getTime())
    .filter((ms) => Number.isFinite(ms) && ms > cutoff && ms <= nowMs + 60_000)
    .sort((a, b) => a - b);

  if (recent.length < input.maxUploads) {
    return {
      allowed: true,
      remaining: input.maxUploads - recent.length,
      retryAfterSeconds: 0,
    };
  }

  const oldest = recent[recent.length - input.maxUploads] ?? nowMs;
  const retryAfterMs = Math.max(1_000, oldest + windowMs - nowMs);

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
  };
}
