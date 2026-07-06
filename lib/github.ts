import "server-only";

import { getRandomUserAgent } from "@/lib/user-agents";
import type { PullRequestMetadata, PullRequestRef } from "@/lib/types";

const GITHUB_API = "https://api.github.com";

export type GitHubFetchErrorKind = "invalid" | "not_found" | "rate_limited" | "upstream";

/** Thrown for user-correctable failures; its message is safe to show in the UI. */
export class GitHubFetchError extends Error {
  readonly kind: GitHubFetchErrorKind;

  constructor(message: string, kind: GitHubFetchErrorKind = "invalid") {
    super(message);
    this.name = "GitHubFetchError";
    this.kind = kind;
  }
}

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * Validates and sanitizes a user-supplied PR URL with the native URL
 * constructor. Anything that is not exactly
 * https://github.com/{owner}/{repo}/pull/{number} is rejected, so no
 * attacker-controlled string ever reaches an outbound request path or the UI.
 */
export function parsePullRequestUrl(input: string): PullRequestRef {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 500) {
    throw new GitHubFetchError("Please paste a GitHub Pull Request URL.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new GitHubFetchError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new GitHubFetchError("Only https:// GitHub URLs are accepted.");
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new GitHubFetchError("URL must point to github.com.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 4 || segments[2] !== "pull") {
    throw new GitHubFetchError(
      "Expected the format github.com/{owner}/{repo}/pull/{number}."
    );
  }

  const [owner, repo, , numberRaw] = segments;
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
    throw new GitHubFetchError("Repository path contains invalid characters.");
  }

  const number = Number.parseInt(numberRaw, 10);
  if (!Number.isSafeInteger(number) || number <= 0 || String(number) !== numberRaw) {
    throw new GitHubFetchError("Pull Request number must be a positive integer.");
  }

  return { owner, repo, number };
}

/** Builds authenticated, bot-resilient headers for every GitHub API call. */
function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": getRandomUserAgent(),
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

async function githubGet(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      headers: buildHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[github] ${path} request failed:`, err);
    throw new GitHubFetchError("GitHub didn't respond in time. Please try again.", "upstream");
  }

  if (response.status === 404) {
    throw new GitHubFetchError(
      "Pull Request not found. Check the URL — private repos need a GITHUB_TOKEN with access.",
      "not_found"
    );
  }
  if (response.status === 403 || response.status === 429) {
    throw new GitHubFetchError(
      "GitHub rate limit reached. Add a GITHUB_TOKEN to raise the limit, or retry shortly.",
      "rate_limited"
    );
  }
  if (!response.ok) {
    // Verbose detail stays on the server; the caller surfaces a generic message.
    console.error(`[github] ${path} responded ${response.status}`);
    throw new GitHubFetchError("GitHub API request failed. Please try again.", "upstream");
  }

  return response.json();
}

interface RawPull {
  title: string;
  created_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  user: { login: string } | null;
}

interface RawCommit {
  commit: { author: { date: string } | null; committer: { date: string } | null };
}

interface RawFile {
  filename: string;
  additions: number;
  deletions: number;
}

/**
 * Fetches the three metadata surfaces the Metadata Cruncher needs — the PR
 * itself, its commit timeline, and its file list — in parallel.
 */
export async function fetchPullRequestMetadata(
  ref: PullRequestRef
): Promise<PullRequestMetadata> {
  const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;

  const [pullRaw, commitsRaw, filesRaw] = (await Promise.all([
    githubGet(base),
    githubGet(`${base}/commits?per_page=100`),
    githubGet(`${base}/files?per_page=100`),
  ])) as [RawPull, RawCommit[], RawFile[]];

  const commitDates = commitsRaw
    .map((c) => c.commit.author?.date ?? c.commit.committer?.date ?? null)
    .filter((d): d is string => d !== null)
    .sort();

  return {
    ref,
    url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    title: pullRaw.title,
    author: pullRaw.user?.login ?? "unknown",
    additions: pullRaw.additions,
    deletions: pullRaw.deletions,
    changedFiles: pullRaw.changed_files,
    commitCount: pullRaw.commits,
    firstCommitAt: commitDates[0] ?? null,
    prCreatedAt: pullRaw.created_at,
    files: filesRaw.map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}
