import { NextResponse, type NextRequest } from "next/server";

import { renderErrorBadge, renderPendingBadge, renderRiskBadge } from "@/lib/badge";
import { auditPullRequest } from "@/lib/gemini";
import {
  GitHubFetchError,
  fetchPullRequestMetadata,
  parsePullRequestUrl,
} from "@/lib/github";
import { crunchMetrics } from "@/lib/metrics";
import { badgeGlobalLimiter, badgeIpLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RiskLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Cache-miss results stay fresh for 6 hours before the next embed view triggers a re-audit. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const SVG_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
} as const;

function svgResponse(svg: string, status = 200) {
  return new NextResponse(svg, { status, headers: SVG_HEADERS });
}

function clientIp(request: NextRequest): string {
  // Prefer x-real-ip: on Vercel it is set by the platform and can't be
  // spoofed by the caller, unlike a client-supplied x-forwarded-for prefix.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Public, unauthenticated SVG badge — embeddable in any repo's README, e.g.
 *   ![SlopShield](https://slopshield.app/api/badge/OWNER/REPO/123)
 *
 * Serves a cached verdict from `badge_scans` when fresh, otherwise runs the
 * same GitHub → Metadata Cruncher → Gemini pipeline as an authenticated scan
 * and caches the result. Never touches `scans` — that table stays scoped to
 * signed-in users via RLS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> }
) {
  const { owner, repo, number } = await params;

  let ref;
  try {
    ref = parsePullRequestUrl(`https://github.com/${owner}/${repo}/pull/${number}`);
  } catch {
    return svgResponse(renderErrorBadge("invalid PR"), 400);
  }

  const prUrl = `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
  const supabase = createAdminClient();

  const { data: cached } = await supabase
    .from("badge_scans")
    .select("risk_score, risk_level, updated_at")
    .eq("pr_url", prUrl)
    .maybeSingle<{ risk_score: number; risk_level: RiskLevel; updated_at: string }>();

  if (cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    return svgResponse(renderRiskBadge(cached.risk_score, cached.risk_level));
  }

  const ip = clientIp(request);
  if (!badgeGlobalLimiter.check("global") || !badgeIpLimiter.check(ip)) {
    // Serve the last known-good verdict if we have one rather than a bare "rate limited" badge.
    if (cached) return svgResponse(renderRiskBadge(cached.risk_score, cached.risk_level));
    return svgResponse(renderPendingBadge(), 200);
  }

  try {
    const pr = await fetchPullRequestMetadata(ref);
    const metrics = crunchMetrics(pr);
    const audit = await auditPullRequest(pr, metrics);

    await supabase.from("badge_scans").upsert(
      {
        pr_url: prUrl,
        repo_full_name: `${ref.owner}/${ref.repo}`,
        pr_number: ref.number,
        risk_score: audit.riskScore,
        risk_level: audit.riskLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pr_url" }
    );

    return svgResponse(renderRiskBadge(audit.riskScore, audit.riskLevel));
  } catch (err) {
    if (err instanceof GitHubFetchError) {
      if (err.kind === "rate_limited") {
        // Transient — serve the last known-good verdict if we have one.
        if (cached) return svgResponse(renderRiskBadge(cached.risk_score, cached.risk_level));
        return svgResponse(renderErrorBadge("rate limited"), 200);
      }
      return svgResponse(renderErrorBadge(err.kind === "not_found" ? "not found" : "unavailable"), 200);
    }
    console.error("[badge] audit failed:", err);
    return svgResponse(renderErrorBadge("error"), 200);
  }
}
