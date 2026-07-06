import type { ScanRecord } from "@/lib/types";

/**
 * Representative sample telemetry for the /demo route: a two-week narrative
 * of one healthy repo slowly accumulating slop, plus a couple of clean PRs.
 * Values are internally consistent (velocity ≈ additions / window, levels
 * match score bands) so the demo reads as real data, not lorem ipsum.
 */

function daysAgo(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 3_600_000).toISOString();
}

interface DemoSeed {
  repo: string;
  pr: number;
  title: string;
  author: string;
  additions: number;
  deletions: number;
  files: number;
  commits: number;
  windowHours: number;
  scannedDaysAgo: number;
  score: number;
  fragility: number;
  warning: string;
  signals: string[];
}

const SEEDS: DemoSeed[] = [
  {
    repo: "acme/checkout-service",
    pr: 412,
    title: "Refactor payment retry logic with backoff",
    author: "mkovacs",
    additions: 320,
    deletions: 210,
    files: 9,
    commits: 7,
    windowHours: 52,
    scannedDaysAgo: 13,
    score: 12,
    fragility: 18,
    warning:
      "Telemetry shows a 2-day iteration window with balanced churn and test movement. This PR carries the signature of deliberate human refactoring.",
    signals: [
      "Velocity 6 lines/hour over 52h window",
      "40% of churn is deletion — active pruning",
      "Tests moved with source (33% of files)",
    ],
  },
  {
    repo: "acme/checkout-service",
    pr: 418,
    title: "Add currency rounding edge cases to invoice tests",
    author: "jchen-dev",
    additions: 180,
    deletions: 40,
    files: 4,
    commits: 3,
    windowHours: 20,
    scannedDaysAgo: 11,
    score: 8,
    fragility: 10,
    warning:
      "A small, test-dominant change developed over 20 hours with a coherent commit trail. No slop indicators present.",
    signals: [
      "Test-file ratio 75%",
      "Velocity 9 lines/hour",
      "Churn density 55 lines/file",
    ],
  },
  {
    repo: "acme/dashboard-web",
    pr: 231,
    title: "New analytics settings panel",
    author: "sluu",
    additions: 940,
    deletions: 120,
    files: 18,
    commits: 9,
    windowHours: 70,
    scannedDaysAgo: 9,
    score: 31,
    fragility: 38,
    warning:
      "Volume is high but spread across 18 files, 9 commits, and a 3-day window, which tempers the risk. Verify the two largest files were reviewed rather than skimmed.",
    signals: [
      "Largest single file +260 lines",
      "Addition dominance 89%",
      "Multi-day window with steady commits",
    ],
  },
  {
    repo: "acme/checkout-service",
    pr: 425,
    title: "Add order export module",
    author: "contractor-9",
    additions: 2140,
    deletions: 35,
    files: 6,
    commits: 2,
    windowHours: 1.5,
    scannedDaysAgo: 6,
    score: 58,
    fragility: 61,
    warning:
      "Over two thousand added lines landed in six files within 90 minutes and only 2 commits, with near-zero deletions. Review the export module for pasted boilerplate before trusting its error handling.",
    signals: [
      "Velocity 1,427 lines/hour",
      "Addition dominance 98%",
      "No test files touched",
    ],
  },
  {
    repo: "acme/dashboard-web",
    pr: 240,
    title: "Fix flaky date filter on Safari",
    author: "sluu",
    additions: 45,
    deletions: 30,
    files: 3,
    commits: 4,
    windowHours: 30,
    scannedDaysAgo: 4,
    score: 9,
    fragility: 12,
    warning:
      "A tight, deletion-heavy bugfix iterated over 30 hours. Telemetry is unambiguous — this is human debugging.",
    signals: [
      "75-line total churn",
      "4 commits for a 3-file change",
      "40% deletion share",
    ],
  },
  {
    repo: "acme/checkout-service",
    pr: 431,
    title: "Implement full subscription billing engine",
    author: "contractor-9",
    additions: 6820,
    deletions: 12,
    files: 14,
    commits: 1,
    windowHours: 0.4,
    scannedDaysAgo: 2,
    score: 91,
    fragility: 88,
    warning:
      "Nearly seven thousand lines arrived in a single commit 24 minutes after branch creation, with no deletions and no tests. Treat this as unreviewed generated output and require a full architectural walkthrough before merge.",
    signals: [
      "Velocity 17,050 lines/hour",
      "Single commit, 24-minute window",
      "Addition dominance 99.8%, zero test movement",
    ],
  },
  {
    repo: "acme/dashboard-web",
    pr: 244,
    title: "Migrate chart tooltips to shared component",
    author: "mkovacs",
    additions: 210,
    deletions: 340,
    files: 11,
    commits: 6,
    windowHours: 26,
    scannedDaysAgo: 1,
    score: 7,
    fragility: 14,
    warning:
      "Deletions outnumber additions across an 11-file consolidation with steady commits. This is textbook healthy refactoring.",
    signals: [
      "Net-negative churn (−130 lines)",
      "Velocity 8 lines/hour",
      "6 commits over 26 hours",
    ],
  },
];

function levelFor(score: number): ScanRecord["risk_level"] {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MODERATE";
  return "LOW";
}

export const DEMO_SCANS: ScanRecord[] = SEEDS.map((seed, index) => {
  const totalChurn = seed.additions + seed.deletions;
  return {
    id: `demo-${index}`,
    pr_url: `https://github.com/${seed.repo}/pull/${seed.pr}`,
    repo_full_name: seed.repo,
    pr_number: seed.pr,
    pr_title: seed.title,
    pr_author: seed.author,
    additions: seed.additions,
    deletions: seed.deletions,
    changed_files: seed.files,
    commit_count: seed.commits,
    first_commit_at: daysAgo(seed.scannedDaysAgo, seed.windowHours),
    pr_created_at: daysAgo(seed.scannedDaysAgo),
    code_velocity: Math.round((seed.additions / seed.windowHours) * 100) / 100,
    churn_per_file: Math.round((totalChurn / seed.files) * 100) / 100,
    addition_dominance: Math.round((seed.additions / totalChurn) * 10_000) / 10_000,
    test_file_ratio: seed.signals.some((s) => s.toLowerCase().includes("test-file ratio 75%"))
      ? 0.75
      : seed.score < 25
        ? 0.33
        : 0,
    risk_score: seed.score,
    risk_level: levelFor(seed.score),
    reviewer_warning: seed.warning,
    fragility_score: seed.fragility,
    key_signals: seed.signals,
    created_at: daysAgo(seed.scannedDaysAgo),
  };
}).sort(
  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);
