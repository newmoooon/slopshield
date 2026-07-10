import { describe, expect, it } from "vitest";
import { GitHubFetchError, parsePullRequestUrl } from "@/lib/github";

describe("parsePullRequestUrl", () => {
  it("parses a canonical PR URL", () => {
    expect(
      parsePullRequestUrl("https://github.com/vercel/next.js/pull/12345")
    ).toEqual({ owner: "vercel", repo: "next.js", number: 12345 });
  });

  it("accepts www.github.com and surrounding whitespace", () => {
    expect(
      parsePullRequestUrl("  https://www.github.com/octo-org/repo_1/pull/7  ")
    ).toEqual({ owner: "octo-org", repo: "repo_1", number: 7 });
  });

  it("ignores query strings and fragments", () => {
    expect(
      parsePullRequestUrl("https://github.com/a/b/pull/9?diff=split#discussion")
    ).toEqual({ owner: "a", repo: "b", number: 9 });
  });

  it.each([
    ["empty input", ""],
    ["not a URL", "definitely not a url"],
    ["http downgrade", "http://github.com/a/b/pull/1"],
    ["wrong host", "https://gitlab.com/a/b/pull/1"],
    ["lookalike host", "https://github.com.evil.example/a/b/pull/1"],
    ["issues path", "https://github.com/a/b/issues/1"],
    ["missing number", "https://github.com/a/b/pull"],
    ["extra segments", "https://github.com/a/b/pull/1/files"],
    ["non-numeric number", "https://github.com/a/b/pull/abc"],
    ["negative number", "https://github.com/a/b/pull/-5"],
    ["leading-zero number", "https://github.com/a/b/pull/007"],
    ["zero", "https://github.com/a/b/pull/0"],
    ["owner with invalid chars", "https://github.com/bad$owner/b/pull/1"],
    ["overlong input", `https://github.com/a/b/pull/1${"x".repeat(600)}`],
  ])("rejects %s", (_label, input) => {
    expect(() => parsePullRequestUrl(input)).toThrow(GitHubFetchError);
  });

  it("throws user-safe messages (no stack/internal details)", () => {
    try {
      parsePullRequestUrl("https://gitlab.com/a/b/pull/1");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubFetchError);
      expect((err as GitHubFetchError).message).toMatch(/github\.com/);
    }
  });
});
