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

/**
 * Hours between two ISO timestamps, floored at 5 minutes, NaN-proof.
 * An unparseable date yields NaN from getTime(), and Math.max(NaN, x) is NaN —
 * which would cascade into a NaN velocity and a failed DB insert. Unparseable
 * or reversed (rebase-dated) timestamps degrade to 0 ("unknown") instead.
 */
function hoursBetween(startIso: string, endIso: string): number {
  const deltaMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(deltaMs)) return 0;
  return Math.max(deltaMs / 3_600_000, 5 / 60);
}

export function crunchMetrics(pr: PullRequestMetadata): CrunchedMetrics {
  const totalChurn = pr.additions + pr.deletions;

  // Code Velocity: lines added / hours between first commit and PR creation.
  // A floor of 5 minutes prevents a same-minute commit+open from producing an
  // absurd division while still flagging it as extreme velocity.
  const devWindowHours = pr.firstCommitAt
    ? hoursBetween(pr.firstCommitAt, pr.prCreatedAt)
    : 0;
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
  const devWindowHours = scan.first_commit_at
    ? hoursBetween(scan.first_commit_at, scan.pr_created_at)
    : 0;

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

/**
 * Deterministic slop-risk prescore from telemetry alone — no AI call. Used as
 * the fallback verdict when a repo-sweep audit omits a PR, so Radar rows are
 * never unscored, and mirrors the calibration bands the Gemini prompt states.
 */
export function heuristicRiskScore(
  metrics: CrunchedMetrics,
  additions: number
): number {
  let score = 0;

  if (metrics.codeVelocityPerHour > 1500) score += 40;
  else if (metrics.codeVelocityPerHour > 500) score += 25;

  if (metrics.additionDominance > 0.95 && additions > 200) score += 20;
  if (metrics.testFileRatio === 0 && additions > 100) score += 15;
  if (metrics.largestFileAdditions > 1000) score += 15;
  if (metrics.devWindowHours > 0 && metrics.devWindowHours < 0.25 && additions > 300)
    score += 10;

  // Small PRs are rarely slop regardless of velocity — sample size matters.
  if (additions < 50) score = Math.min(score, 20);

  return Math.min(score, 100);
}
