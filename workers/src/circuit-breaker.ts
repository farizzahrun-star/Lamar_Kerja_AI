export interface CircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  cooldownMs?: number;
  now?: () => number;
}

export type CircuitState = "closed" | "open";

/**
 * Circuit breaker sederhana berbasis memori: bila `failureThreshold` kegagalan
 * terjadi dalam `windowMs`, breaker membuka dan menolak percobaan selama
 * `cooldownMs`. Dipakai agar worker tidak menghajar Ollama yang sedang mati.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.windowMs = options.windowMs ?? 5 * 60_000;
    this.cooldownMs = options.cooldownMs ?? 10 * 60_000;
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt < this.cooldownMs ? "open" : "closed";
  }

  /** Sisa waktu jeda dalam milidetik (0 bila breaker tertutup). */
  remainingCooldownMs(): number {
    if (this.openedAt === null) return 0;
    const remaining = this.cooldownMs - (this.now() - this.openedAt);
    if (remaining <= 0) {
      // Cooldown selesai: reset agar percobaan berikutnya bersih.
      this.openedAt = null;
      this.failures = [];
      return 0;
    }
    return remaining;
  }

  canAttempt(): boolean {
    return this.remainingCooldownMs() === 0;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = null;
  }

  recordFailure(): void {
    const current = this.now();
    this.failures = this.failures.filter((timestamp) => current - timestamp < this.windowMs);
    this.failures.push(current);

    if (this.failures.length >= this.failureThreshold) {
      this.openedAt = current;
      this.failures = [];
    }
  }
}
