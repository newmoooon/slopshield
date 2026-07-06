import type { CrunchedMetrics, PullRequestMetadata, ScanRecord } from "@/lib/types";

/**
 * The Metadata Cruncher.
 *
 * Human engineering leaves a temporal signature: code accretes over hours or
 * days, deletions accompany additions, tests move with source. AI slop tends
 * to arrive as a single monolithic paste — thousands of added lines minutes
 * after the first commit, near-zero deletions, no tests. These derived
 * metrics quantify that signature before the AI audit ever runs.
 */

/** Blended fully-loaded senior engineer review rate (USD/hour). */
const BLENDED_REVIEW_RATE_USD = 85;

/** Empirical thorough-review throughput: ~400 lines of churn per hour. */
const REVIEW_LINES_PER_HOUR = 400;

const TEST_FILE_PATTERN =
  /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)|\.(test|spec)\.[jt]sx?$|_test\.(go|py|rb|ex|exs)$|Tests?\.(java|kt|swift|cs)$/i;

export function crunchMetrics(pr: PullRequestMetadata): CrunchedMetrics {
  const totalChurn = pr.additions + pr.deletions;

  // Code Velocity: lines added / hours between first commit and PR creation.
  // A floor of 5 minutes prevents a same-minute commit+open from producing an
  // absurd division while still flagging it as extreme velocity.
  let devWindowHours = 0;
  if (pr.firstCommitAt) {
    const deltaMs =
      new Date(pr.prCreatedAt).getTime() - new Date(pr.firstCommitAt).getTime();
    devWindowHours = Math.max(deltaMs / 3_600_000, 5 / 60);
  }
  const codeVelocityPerHour =
    devWindowHours > 0 ? pr.additions / devWindowHours : pr.additions * 12;

  const churnPerFile = pr.changedFiles > 0 ? totalChurn / pr.changedFiles : 0;
  const additionDominance = totalChurn > 0 ? pr.additions / totalChurn : 0;

  const testFiles = pr.files.filter((f) => TEST_FILE_PATTERN.test(f.filename));
  const testFileRatio =
    pr.files.length > 0 ? testFiles.length / pr.files.length : 0;

  const largestFileAdditions = pr.files.reduce(
    (max, f) => Math.max(max, f.additions),
    0
  );

  const estReviewHours = totalChurn / REVIEW_LINES_PER_HOUR;
  const estReviewCostUsd = estReviewHours * BLENDED_REVIEW_RATE_USD;

  return {
    codeVelocityPerHour: round2(codeVelocityPerHour),
    devWindowHours: round2(devWindowHours),
    churnPerFile: round2(churnPerFile),
    additionDominance: round4(additionDominance),
    testFileRatio: round4(testFileRatio),
    largestFileAdditions,
    estReviewHours: round2(estReviewHours),
    estReviewCostUsd: round2(estReviewCostUsd),
  };
}

/**
 * Reconstructs CrunchedMetrics from a persisted ScanRecord, for the
 * re-scan cache path (see `analyzePullRequest`'s cooldown reuse). Every
 * field the DB stores is recomputed exactly; `largestFileAdditions` isn't
 * persisted, so it degrades to 0 rather than re-fetching from GitHub —
 * an acceptable cosmetic loss on a cache hit.
 */
export function metricsFromScan(scan: ScanRecord): CrunchedMetrics {
  let devWindowHours = 0;
  if (scan.first_commit_at) {
    const deltaMs =
      new Date(scan.pr_created_at).getTime() - new Date(scan.first_commit_at).getTime();
    devWindowHours = Math.max(deltaMs / 3_600_000, 5 / 60);
  }

  const totalChurn = scan.additions + scan.deletions;
  const estReviewHours = totalChurn / REVIEW_LINES_PER_HOUR;

  return {
    codeVelocityPerHour: scan.code_velocity,
    devWindowHours: round2(devWindowHours),
    churnPerFile: scan.churn_per_file,
    additionDominance: scan.addition_dominance,
    testFileRatio: scan.test_file_ratio,
    largestFileAdditions: 0,
    estReviewHours: round2(estReviewHours),
    estReviewCostUsd: round2(estReviewHours * BLENDED_REVIEW_RATE_USD),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Localized multi-currency formatting via Intl.NumberFormat — review-burden
 * costs render in the viewer's locale and currency, never hand-concatenated
 * symbol strings.
 */
export function formatCurrency(
  value: number,
  currency: string = "USD",
  locale?: string
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Unknown currency/locale tags fall back to a deterministic USD render.
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
}

/** Compact numeric display for stat tiles: 1234 → "1.2K". */
export function formatCompact(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Renders a dev-window duration as a human string: 0.5 → "30m", 26 → "1.1d". */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}
