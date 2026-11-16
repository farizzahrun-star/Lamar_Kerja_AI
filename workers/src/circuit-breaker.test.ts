import { describe, expect, it } from "vitest";

import { CircuitBreaker } from "./circuit-breaker";

function makeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("CircuitBreaker", () => {
  it("membuka breaker setelah 3 kegagalan dalam 5 menit", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({ now: clock.now });

    expect(breaker.canAttempt()).toBe(true);

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(true);

    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(false);
    expect(breaker.state).toBe("open");
  });

  it("kegagalan lama di luar window tidak dihitung", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({ now: clock.now });

    breaker.recordFailure();
    breaker.recordFailure();
    clock.advance(6 * 60_000);
    breaker.recordFailure();

    expect(breaker.canAttempt()).toBe(true);
  });

  it("cooldown 10 menit lalu kembali tertutup", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({ now: clock.now });

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(9 * 60_000);
    expect(breaker.remainingCooldownMs()).toBe(60_000);

    clock.advance(60_000);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.state).toBe("closed");
  });

  it("recordSuccess mereset hitungan kegagalan", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({ now: clock.now });

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canAttempt()).toBe(true);
  });
});
