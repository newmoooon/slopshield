import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixedWindowLimiter } from "@/lib/rate-limit";

describe("FixedWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max requests in a window, then blocks", () => {
    const limiter = new FixedWindowLimiter(3, 60_000);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false);
    expect(limiter.check("ip-1")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new FixedWindowLimiter(1, 60_000);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-2")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false);
    expect(limiter.check("ip-2")).toBe(false);
  });

  it("resets after the window elapses", () => {
    const limiter = new FixedWindowLimiter(1, 60_000);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("ip-1")).toBe(true);
  });

  it("evicts expired entries instead of growing unboundedly", () => {
    const limiter = new FixedWindowLimiter(1, 60_000);
    for (let i = 0; i < 5001; i++) limiter.check(`ip-${i}`);

    vi.advanceTimersByTime(60_001);
    // The next insert past the 5000-entry high-water mark triggers eviction of
    // the (now all-expired) old keys; behavior must stay correct throughout.
    expect(limiter.check("fresh-key")).toBe(true);
    expect(limiter.check("fresh-key")).toBe(false);
  });
});
