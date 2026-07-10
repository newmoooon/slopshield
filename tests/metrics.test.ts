import { describe, expect, it } from "vitest";
import { crunchMetrics, formatHours } from "@/lib/metrics";
import type { PullRequestMetadata } from "@/lib/types";

function pr(overrides: Partial<PullRequestMetadata> = {}): PullRequestMetadata {
  return {
    ref: { owner: "acme", repo: "widget", number: 1 },
    url: "https://github.com/acme/widget/pull/1",
    title: "Add widget",
    author: "dev",
    additions: 200,
    deletions: 100,
    changedFiles: 6,
    commitCount: 4,
    firstCommitAt: "2026-01-01T00:00:00Z",
    prCreatedAt: "2026-01-01T10:00:00Z",
    files: [
      { filename: "src/widget.ts", additions: 120, deletions: 60 },
      { filename: "src/widget.test.ts", additions: 80, deletions: 40 },
    ],
    ...overrides,
  };
}

describe("crunchMetrics", () => {
  it("computes the organic-PR signature", () => {
    const m = crunchMetrics(pr());
    expect(m.devWindowHours).toBe(10);
    expect(m.codeVelocityPerHour).toBe(20); // 200 added / 10h
    expect(m.churnPerFile).toBe(50); // 300 churn / 6 files
    expect(m.additionDominance).toBeCloseTo(0.6667, 3);
    expect(m.testFileRatio).toBe(0.5); // 1 of 2 files is a test
    expect(m.largestFileAdditions).toBe(120);
    expect(m.estReviewHours).toBe(0.75); // 300 / 400
    expect(m.estReviewCostUsd).toBe(63.75); // 0.75 * 85
  });

  it("flags the monolithic-paste signature", () => {
    const m = crunchMetrics(
      pr({
        additions: 5000,
        deletions: 3,
        changedFiles: 2,
        firstCommitAt: "2026-01-01T09:58:00Z", // 2 minutes before PR open
        files: [{ filename: "src/generated.ts", additions: 4900, deletions: 0 }],
      })
    );
    // Dev window floors at 5 minutes, so velocity is extreme but finite.
    expect(m.devWindowHours).toBeCloseTo(5 / 60, 2);
    expect(m.codeVelocityPerHour).toBe(60000);
    expect(m.additionDominance).toBeCloseTo(0.9994, 3);
    expect(m.testFileRatio).toBe(0);
    expect(m.largestFileAdditions).toBe(4900);
  });

  it("degrades gracefully when the commit timeline is missing", () => {
    const m = crunchMetrics(pr({ firstCommitAt: null, additions: 100 }));
    expect(m.devWindowHours).toBe(0);
    expect(m.codeVelocityPerHour).toBe(1200); // additions * 12 fallback
  });

  it("treats unparseable or rebase-reversed timestamps as unknown, not NaN", () => {
    const garbage = crunchMetrics(pr({ firstCommitAt: "not-a-date" }));
    expect(garbage.devWindowHours).toBe(0);
    expect(Number.isFinite(garbage.codeVelocityPerHour)).toBe(true);

    const reversed = crunchMetrics(
      pr({ firstCommitAt: "2026-01-02T00:00:00Z", prCreatedAt: "2026-01-01T00:00:00Z" })
    );
    // Reversed dates floor to the 5-minute minimum window.
    expect(reversed.devWindowHours).toBeCloseTo(5 / 60, 2);
  });

  it("never divides by zero on empty PRs", () => {
    const m = crunchMetrics(
      pr({ additions: 0, deletions: 0, changedFiles: 0, files: [] })
    );
    expect(m.churnPerFile).toBe(0);
    expect(m.additionDominance).toBe(0);
    expect(m.testFileRatio).toBe(0);
    expect(m.largestFileAdditions).toBe(0);
  });

  it.each([
    ["tests/unit/foo.py", true],
    ["src/__tests__/bar.tsx", true],
    ["lib/thing.spec.ts", true],
    ["pkg/server_test.go", true],
    ["app/FooTests.swift", true],
    ["src/contest.ts", false], // "test" as substring must not match
    ["attestation/verify.ts", false],
    ["src/protester.py", false],
  ])("test-file detection: %s → %s", (filename, isTest) => {
    const m = crunchMetrics(
      pr({ files: [{ filename, additions: 10, deletions: 0 }] })
    );
    expect(m.testFileRatio).toBe(isTest ? 1 : 0);
  });
});

describe("formatHours", () => {
  it.each([
    [0.5, "30m"],
    [1.25, "1.3h"],
    [26, "26h"],
    [72, "3d"],
  ])("%s hours → %s", (hours, label) => {
    expect(formatHours(hours)).toBe(label);
  });
});
