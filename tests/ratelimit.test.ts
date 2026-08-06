import { beforeEach, describe, expect, it } from 'vitest';
import { checkLimit, resetLimits } from '@/lib/ratelimit';

beforeEach(() => resetLimits());

describe('rate limiter', () => {
  it('allows up to the limit inside a window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(checkLimit('k', 5, 60_000, t0 + i).allowed).toBe(true);
    }
    const blocked = checkLimit('k', 5, 60_000, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) checkLimit('k', 5, 60_000, t0);
    expect(checkLimit('k', 5, 60_000, t0).allowed).toBe(false);
    expect(checkLimit('k', 5, 60_000, t0 + 60_001).allowed).toBe(true);
  });

  it('keys are independent', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) checkLimit('a', 5, 60_000, t0);
    expect(checkLimit('a', 5, 60_000, t0).allowed).toBe(false);
    expect(checkLimit('b', 5, 60_000, t0).allowed).toBe(true);
  });

  it('reports remaining budget', () => {
    const t0 = 1_000_000;
    expect(checkLimit('r', 3, 60_000, t0).remaining).toBe(2);
    expect(checkLimit('r', 3, 60_000, t0).remaining).toBe(1);
    expect(checkLimit('r', 3, 60_000, t0).remaining).toBe(0);
  });
});
