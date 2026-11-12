/**
 * Hanya mengizinkan redirect internal (path yang diawali "/" tunggal).
 * Mencegah open redirect lewat parameter `next`.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
