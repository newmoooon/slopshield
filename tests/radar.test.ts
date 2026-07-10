import { describe, expect, it } from "vitest";
import { normalizeRepoAudit, riskScoreToLevel } from "@/lib/gemini";
import { GitHubFetchError, parseRepoInput } from "@/lib/github";
import { crunchMetrics, heuristicRiskScore } from "@/lib/metrics";
import type { PullRequestMetadata } from "@/lib/types";

describe("parseRepoInput", () => {
  it("parses the bare owner/repo shorthand", () => {
    expect(parseRepoInput("vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("parses a full repository URL, with or without a trailing slash", () => {
    expect(parseRepoInput("https://github.com/octo-org/repo_1")).toEqual({
      owner: "octo-org",
      repo: "repo_1",
    });
    expect(parseRepoInput("https://www.github.com/octo-org/repo_1/")).toEqual({
      owner: "octo-org",
      repo: "repo_1",
    });
  });

  it.each([
    ["empty", ""],
    ["just an owner", "vercel"],
    ["a PR URL (three+ segments)", "https://github.com/a/b/pull/1"],
    ["http downgrade", "http://github.com/a/b"],
    ["wrong host", "https://gitlab.com/a/b"],
    ["invalid owner characters", "bad$owner/repo"],
    ["overlong input", "a/" + "b".repeat(600)],
  ])("rejects %s", (_label, input) => {
    expect(() => parseRepoInput(input)).toThrow(GitHubFetchError);
  });
});

describe("heuristicRiskScore", () => {
  function metricsFor(overrides: Partial<PullRequestMetadata>) {
    const pr: PullRequestMetadata = {
      ref: { owner: "a", repo: "b", number: 1 },
      url: "https://github.com/a/b/pull/1",
      title: "t",
      author: "dev",
      additions: 200,
      deletions: 100,
      changedFiles: 5,
      commitCount: 3,
      firstCommitAt: "2026-01-01T00:00:00Z",
      prCreatedAt: "2026-01-01T10:00:00Z",
      files: [{ filename: "src/x.test.ts", additions: 50, deletions: 10 }],
      ...overrides,
    };
    return { metrics: crunchMetrics(pr), additions: pr.additions };
  }

  it("scores an organic PR low", () => {
    const { metrics, additions } = metricsFor({});
    expect(heuristicRiskScore(metrics, additions)).toBeLessThan(25);
  });

  it("scores a monolithic paste high", () => {
    const { metrics, additions } = metricsFor({
      additions: 5000,
      deletions: 2,
      firstCommitAt: "2026-01-01T09:58:00Z",
      files: [{ filename: "src/generated.ts", additions: 4900, deletions: 0 }],
    });
    expect(heuristicRiskScore(metrics, additions)).toBeGreaterThanOrEqual(75);
  });

  it("caps tiny PRs regardless of velocity", () => {
    const { metrics } = metricsFor({
      additions: 30,
      deletions: 0,
      firstCommitAt: "2026-01-01T09:59:00Z",
      files: [{ filename: "src/x.ts", additions: 30, deletions: 0 }],
    });
    expect(heuristicRiskScore(metrics, 30)).toBeLessThanOrEqual(20);
  });
});

describe("normalizeRepoAudit", () => {
  const valid = {
    repoRiskScore: 55,
    repoSummary: "Queue skews risky. Review #12 first.",
    prVerdicts: [
      { number: 12, riskScore: 90, note: "60k lines/hour paste" },
      { number: 7, riskScore: 15, note: "organic cadence" },
    ],
  };

  it("passes a well-formed audit through", () => {
    expect(normalizeRepoAudit(valid, [12, 7])).toEqual(valid);
  });

  it("drops verdicts for PR numbers that were never sent", () => {
    const audit = normalizeRepoAudit(
      { ...valid, prVerdicts: [...valid.prVerdicts, { number: 999, riskScore: 50, note: "hallucinated" }] },
      [12, 7]
    );
    expect(audit.prVerdicts.map((v) => v.number)).toEqual([12, 7]);
  });

  it("keeps the first occurrence when the model duplicates a PR", () => {
    const audit = normalizeRepoAudit(
      {
        ...valid,
        prVerdicts: [
          { number: 12, riskScore: 90, note: "first" },
          { number: 12, riskScore: 10, note: "second" },
        ],
      },
      [12]
    );
    expect(audit.prVerdicts).toEqual([{ number: 12, riskScore: 90, note: "first" }]);
  });

  it("clamps scores and substitutes fallback text", () => {
    const audit = normalizeRepoAudit(
      {
        repoRiskScore: 400,
        repoSummary: "   ",
        prVerdicts: [{ number: 7, riskScore: -3, note: "" }],
      },
      [7]
    );
    expect(audit.repoRiskScore).toBe(100);
    expect(audit.repoSummary).toMatch(/manually/i);
    expect(audit.prVerdicts[0]).toEqual({
      number: 7,
      riskScore: 0,
      note: "No decisive signal reported.",
    });
  });

  it("tolerates garbage verdict entries and non-array shapes", () => {
    expect(
      normalizeRepoAudit({ ...valid, prVerdicts: [null, "x", 4] }, [12, 7]).prVerdicts
    ).toEqual([]);
    expect(
      normalizeRepoAudit({ ...valid, prVerdicts: "nope" }, [12, 7]).prVerdicts
    ).toEqual([]);
  });

  it("rejects non-object payloads", () => {
    expect(() => normalizeRepoAudit(null, [])).toThrow();
  });
});

describe("riskScoreToLevel", () => {
  it.each([
    [0, "LOW"],
    [24, "LOW"],
    [25, "MODERATE"],
    [49, "MODERATE"],
    [50, "HIGH"],
    [74, "HIGH"],
    [75, "CRITICAL"],
    [100, "CRITICAL"],
  ])("%s → %s", (score, level) => {
    expect(riskScoreToLevel(score)).toBe(level);
  });
});
