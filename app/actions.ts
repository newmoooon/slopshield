"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditPullRequest, auditRepository, riskScoreToLevel } from "@/lib/gemini";
import {
  GitHubFetchError,
  fetchOpenPullRequests,
  fetchPullRequestMetadata,
  parsePullRequestUrl,
  parseRepoInput,
} from "@/lib/github";
import { crunchMetrics, heuristicRiskScore, metricsFromScan } from "@/lib/metrics";
import { radarUserLimiter, scanUserLimiter } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { AnalyzeResult, RadarResult, ScanRecord } from "@/lib/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A closed PR's telemetry never changes, so a same-user re-scan within this
 *  window reuses the prior verdict instead of re-billing GitHub + Gemini. An
 *  open PR can gain new commits inside the window — a short cooldown, not a
 *  permanent cache, keeps that staleness risk small. */
const RESCAN_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * The full execution workflow, server-side only:
 *
 *   URL validation → GitHub metadata fetch → Metadata Cruncher →
 *   Gemini structured audit → RLS-scoped Supabase persistence.
 *
 * Error policy: verbose diagnostics go to the server console; the client
 * receives either a user-correctable message (bad URL, rate limit) or a
 * single generalized failure notice — internals never leak to the UI.
 */
export async function analyzePullRequest(rawUrl: string): Promise<AnalyzeResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: "Supabase is not configured yet. Fill in .env.local and restart.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  try {
    // 1. Validate & sanitize the URL — nothing unparsed proceeds past here.
    const ref = parsePullRequestUrl(rawUrl);
    const prUrl = `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;

    // 2. Reuse a recent verdict for this exact user+PR instead of re-billing
    //    GitHub + Gemini for what's very likely an accidental repeat submit.
    const { data: recent } = await supabase
      .from("scans")
      .select("*")
      .eq("user_id", user.id)
      .eq("pr_url", prUrl)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ScanRecord>();

    if (recent && Date.now() - new Date(recent.created_at).getTime() < RESCAN_COOLDOWN_MS) {
      return { ok: true, scan: recent, metrics: metricsFromScan(recent) };
    }

    // 3. Cap how fast one signed-in user can trigger the expensive path.
    if (!scanUserLimiter.check(user.id)) {
      return {
        ok: false,
        error: "You're auditing PRs faster than we can safely process them. Wait a moment and try again.",
      };
    }

    // 4. Behavioral telemetry from the GitHub REST API.
    const pr = await fetchPullRequestMetadata(ref);

    // 5. The Metadata Cruncher.
    const metrics = crunchMetrics(pr);

    // 6. The AI Brain — Gemini 2.5 Flash with a strict response schema.
    const audit = await auditPullRequest(pr, metrics);

    // 7. Persist. The SDK parameterizes every value; RLS pins the row to the
    //    signed-in user.
    const { data, error } = await supabase
      .from("scans")
      .insert({
        user_id: user.id,
        pr_url: pr.url,
        repo_full_name: `${ref.owner}/${ref.repo}`,
        pr_number: ref.number,
        pr_title: pr.title.slice(0, 300),
        pr_author: pr.author,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changedFiles,
        commit_count: pr.commitCount,
        first_commit_at: pr.firstCommitAt,
        pr_created_at: pr.prCreatedAt,
        code_velocity: metrics.codeVelocityPerHour,
        churn_per_file: metrics.churnPerFile,
        addition_dominance: metrics.additionDominance,
        test_file_ratio: metrics.testFileRatio,
        risk_score: audit.riskScore,
        risk_level: audit.riskLevel,
        reviewer_warning: audit.reviewerWarning,
        fragility_score: audit.fragilityScore,
        key_signals: audit.keySignals,
      })
      .select()
      .single<ScanRecord>();

    if (error) {
      console.error("[actions] scan insert failed:", error);
      return {
        ok: false,
        error: "The analysis finished but could not be saved. Please retry.",
      };
    }

    revalidatePath("/");
    return { ok: true, scan: data, metrics };
  } catch (err) {
    if (err instanceof GitHubFetchError) {
      // User-correctable and pre-sanitized — safe to surface verbatim.
      return { ok: false, error: err.message };
    }
    console.error("[actions] analyzePullRequest failed:", err);
    return {
      ok: false,
      error: "Analysis failed unexpectedly. Our telemetry pipeline logged the details — please try again.",
    };
  }
}

/** How many open PRs one Radar sweep fully audits (each costs ~3 GitHub calls). */
const RADAR_SWEEP_LIMIT = 8;

/**
 * Repo Radar: sweep a repository's open PR queue in one shot.
 *
 *   repo validation → open-PR telemetry fan-out → Metadata Cruncher per PR →
 *   ONE Gemini call scoring the whole queue relative to its own baseline.
 *
 * Stateless by design — nothing is persisted, so the sweep works on any repo
 * without touching the user's scan history. PRs the model fails to score fall
 * back to the deterministic heuristic prescore rather than rendering unscored.
 */
export async function analyzeRepository(rawInput: string): Promise<RadarResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: "Supabase is not configured yet. Fill in .env.local and restart.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  try {
    const ref = parseRepoInput(rawInput);
    const repoFullName = `${ref.owner}/${ref.repo}`;

    if (!radarUserLimiter.check(user.id)) {
      return {
        ok: false,
        error: "Radar sweeps are limited to a few per five minutes — each one audits an entire PR queue. Try again shortly.",
      };
    }

    const { openPrCount, prs } = await fetchOpenPullRequests(ref, RADAR_SWEEP_LIMIT);

    if (prs.length === 0) {
      return {
        ok: true,
        repo: repoFullName,
        openPrCount: 0,
        scannedCount: 0,
        repoRiskScore: 0,
        repoRiskLevel: "LOW",
        repoSummary: "No open pull requests — nothing to audit.",
        prs: [],
      };
    }

    const crunched = prs.map((pr) => ({ pr, metrics: crunchMetrics(pr) }));

    const audit = await auditRepository(
      repoFullName,
      crunched.map(({ pr, metrics }) => ({
        number: pr.ref.number,
        title: pr.title,
        additions: pr.additions,
        deletions: pr.deletions,
        filesChanged: pr.changedFiles,
        metrics,
      }))
    );

    const verdictByNumber = new Map(audit.prVerdicts.map((v) => [v.number, v]));

    const radarPrs = crunched
      .map(({ pr, metrics }) => {
        const verdict = verdictByNumber.get(pr.ref.number);
        const riskScore =
          verdict?.riskScore ?? heuristicRiskScore(metrics, pr.additions);
        return {
          number: pr.ref.number,
          title: pr.title.slice(0, 300),
          author: pr.author,
          url: pr.url,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changedFiles,
          prCreatedAt: pr.prCreatedAt,
          metrics,
          riskScore,
          riskLevel: riskScoreToLevel(riskScore),
          note: verdict?.note ?? "Scored by telemetry heuristic (no model verdict returned).",
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);

    return {
      ok: true,
      repo: repoFullName,
      openPrCount,
      scannedCount: radarPrs.length,
      repoRiskScore: audit.repoRiskScore,
      repoRiskLevel: riskScoreToLevel(audit.repoRiskScore),
      repoSummary: audit.repoSummary,
      prs: radarPrs,
    };
  } catch (err) {
    if (err instanceof GitHubFetchError) {
      if (err.kind === "not_found") {
        return { ok: false, error: "Repository not found. Check the owner/repo spelling — private repos need a GITHUB_TOKEN with access." };
      }
      return { ok: false, error: err.message };
    }
    console.error("[actions] analyzeRepository failed:", err);
    return {
      ok: false,
      error: "Radar sweep failed unexpectedly. Our telemetry pipeline logged the details — please try again.",
    };
  }
}

/** Ends the Supabase session and returns the visitor to the login screen. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Deletes one of the signed-in user's own scans. RLS also enforces the
 *  ownership check server-side, so the `.eq("user_id", ...)` here is
 *  belt-and-suspenders, not the only guard. */
export async function deleteScan(
  scanId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_PATTERN.test(scanId)) {
    return { ok: false, error: "Invalid scan id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const { error } = await supabase
    .from("scans")
    .delete()
    .eq("id", scanId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[actions] deleteScan failed:", error);
    return { ok: false, error: "Could not delete that scan. Please retry." };
  }

  revalidatePath("/");
  return { ok: true };
}
