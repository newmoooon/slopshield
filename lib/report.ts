import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { auditPullRequest } from "@/lib/gemini";
import { GitHubFetchError, fetchPullRequestMetadata } from "@/lib/github";
import { crunchMetrics } from "@/lib/metrics";
import { badgeGlobalLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CrunchedMetrics, GeminiAudit, PullRequestRef } from "@/lib/types";

/**
 * The public-surface audit: one shared, cached pipeline behind the
 * unauthenticated report page (and its OG card). Results live in the Next.js
 * data cache for the same 6h TTL as the README badge, so a shared report link
 * costs GitHub + Gemini once per window no matter how many people open it.
 *
 * Thrown errors are deliberately NOT cached (unstable_cache never stores a
 * rejected promise), so a transient failure doesn't poison a URL for 6 hours.
 */

export const PUBLIC_AUDIT_TTL_S = 6 * 60 * 60;

/** Everything the public report page and OG card need, fully serializable. */
export interface PublicAudit {
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  title: string;
  author: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  firstCommitAt: string | null;
  prCreatedAt: string;
  metrics: CrunchedMetrics;
  audit: GeminiAudit;
  auditedAt: string;
}

export type PublicAuditErrorKind = "not_found" | "rate_limited" | "unavailable";

/** Typed failure the page maps to notFound() or a friendly retry state. */
export class PublicAuditError extends Error {
  readonly kind: PublicAuditErrorKind;

  constructor(kind: PublicAuditErrorKind, message: string) {
    super(message);
    this.name = "PublicAuditError";
    this.kind = kind;
  }
}

async function runPublicAudit(
  owner: string,
  repo: string,
  number: number
): Promise<PublicAudit> {
  // Cache misses are the expensive path (3 GitHub calls + 1 Gemini call).
  // The global fixed-window cap stops URL-enumeration from burning quota;
  // per-URL cost is already bounded by the data cache TTL.
  if (!badgeGlobalLimiter.check("global")) {
    throw new PublicAuditError(
      "rate_limited",
      "Public audits are briefly rate limited. Try again in a minute."
    );
  }

  const ref: PullRequestRef = { owner, repo, number };
  let pr;
  try {
    pr = await fetchPullRequestMetadata(ref);
  } catch (err) {
    if (err instanceof GitHubFetchError) {
      if (err.kind === "not_found") {
        throw new PublicAuditError("not_found", err.message);
      }
      if (err.kind === "rate_limited") {
        throw new PublicAuditError("rate_limited", err.message);
      }
    }
    throw new PublicAuditError("unavailable", "GitHub was unreachable. Try again shortly.");
  }

  const metrics = crunchMetrics(pr);
  const audit = await auditPullRequest(pr, metrics);

  // Keep the README badge warm from the same result — best-effort, the
  // report itself must not fail on a cache-table hiccup. Note supabase-js
  // reports failures as a returned `error` value, not an exception.
  try {
    const { error } = await createAdminClient()
      .from("badge_scans")
      .upsert(
        {
          pr_url: pr.url,
          repo_full_name: `${owner}/${repo}`,
          pr_number: number,
          risk_score: audit.riskScore,
          risk_level: audit.riskLevel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pr_url" }
      );
    if (error) console.error("[report] badge_scans upsert failed:", error);
  } catch (err) {
    console.error("[report] badge_scans upsert failed:", err);
  }

  return {
    repoFullName: `${owner}/${repo}`,
    prNumber: number,
    prUrl: pr.url,
    title: pr.title.slice(0, 300),
    author: pr.author,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    commitCount: pr.commitCount,
    firstCommitAt: pr.firstCommitAt,
    prCreatedAt: pr.prCreatedAt,
    metrics,
    audit,
    auditedAt: new Date().toISOString(),
  };
}

const getCachedPublicAudit = unstable_cache(runPublicAudit, ["public-audit"], {
  revalidate: PUBLIC_AUDIT_TTL_S,
});

/**
 * React-cache wrapper on top of the data cache: generateMetadata and the page
 * body both call this in one request but the pipeline runs at most once.
 */
export const getPublicAudit = cache(
  (ref: PullRequestRef): Promise<PublicAudit> =>
    getCachedPublicAudit(ref.owner, ref.repo, ref.number)
);
