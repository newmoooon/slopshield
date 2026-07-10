export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

/** Parsed identity of a GitHub Pull Request URL. */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

/** Raw behavioral telemetry pulled from the GitHub REST API. */
export interface PullRequestMetadata {
  ref: PullRequestRef;
  url: string;
  title: string;
  author: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  /** ISO timestamp of the earliest commit on the PR branch. */
  firstCommitAt: string | null;
  /** ISO timestamp the PR was opened. */
  prCreatedAt: string;
  /** Filenames touched by the PR (capped at 100 by the API page size). */
  files: Array<{ filename: string; additions: number; deletions: number }>;
}

/** Metrics derived by the Metadata Cruncher before the AI audit. */
export interface CrunchedMetrics {
  /** Lines added per hour between first commit and PR creation. */
  codeVelocityPerHour: number;
  /** Hours between first commit and PR creation. */
  devWindowHours: number;
  /** (additions + deletions) / changed files — churn density. */
  churnPerFile: number;
  /** additions / (additions + deletions) — 1.0 means pure paste, zero pruning. */
  additionDominance: number;
  /** Fraction of changed files that are tests. */
  testFileRatio: number;
  /** Largest single-file addition count — generated-dump concentration signal. */
  largestFileAdditions: number;
  /** Estimated human review burden in hours. */
  estReviewHours: number;
  /** Estimated review cost at a blended engineer rate, in USD. */
  estReviewCostUsd: number;
}

/** Structured verdict returned by the Gemini Principal DevOps Auditor. */
export interface GeminiAudit {
  riskScore: number;
  riskLevel: RiskLevel;
  reviewerWarning: string;
  fragilityScore: number;
  keySignals: string[];
}

/** One persisted scan row (mirrors public.scans). */
export interface ScanRecord {
  id: string;
  pr_url: string;
  repo_full_name: string;
  pr_number: number;
  pr_title: string;
  pr_author: string;
  additions: number;
  deletions: number;
  changed_files: number;
  commit_count: number;
  first_commit_at: string | null;
  pr_created_at: string;
  code_velocity: number;
  churn_per_file: number;
  addition_dominance: number;
  test_file_ratio: number;
  risk_score: number;
  risk_level: RiskLevel;
  reviewer_warning: string;
  fragility_score: number;
  key_signals: string[];
  created_at: string;
}

/** Discriminated result returned by the analyze server action. */
export type AnalyzeResult =
  | { ok: true; scan: ScanRecord; metrics: CrunchedMetrics }
  | { ok: false; error: string };

/** Parsed identity of a repository (Repo Radar input). */
export interface RepoRef {
  owner: string;
  repo: string;
}

/** One open PR in a Repo Radar sweep, with its crunched metrics and verdict. */
export interface RadarPullRequest {
  number: number;
  title: string;
  author: string;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  prCreatedAt: string;
  metrics: CrunchedMetrics;
  riskScore: number;
  riskLevel: RiskLevel;
  /** One-line reviewer note for this PR from the repo-level audit. */
  note: string;
}

/** Repo-level verdict Gemini returns for a Radar sweep. */
export interface RepoAudit {
  repoRiskScore: number;
  repoSummary: string;
  prVerdicts: Array<{ number: number; riskScore: number; note: string }>;
}

/** Discriminated result returned by the Repo Radar server action. */
export type RadarResult =
  | {
      ok: true;
      repo: string;
      openPrCount: number;
      scannedCount: number;
      repoRiskScore: number;
      repoRiskLevel: RiskLevel;
      repoSummary: string;
      prs: RadarPullRequest[];
    }
  | { ok: false; error: string };
