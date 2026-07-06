import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Nightly repository-health aggregator.
 *
 * Rolls every scan from the trailing 30 days up into per-repo daily
 * snapshots (public.repo_health_snapshots), which power fleet-level health
 * trends without ever re-querying GitHub or Gemini.
 *
 * Security: callers must present `Authorization: Bearer <CRON_SECRET>`.
 * The comparison is constant-time; anything else gets an instant 401 with
 * no detail about why. Vercel Cron attaches this header automatically when
 * a CRON_SECRET environment variable exists on the project.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Aggregate in memory: repo → { count, riskSum, riskMax, fragilitySum }.
    const buckets = new Map<
      string,
      { count: number; riskSum: number; riskMax: number; fragilitySum: number }
    >();

    // PostgREST caps a single response at ~1000 rows regardless of how many
    // match — paging with .range() is required or a busy fleet silently
    // drops rows from the aggregate with no error.
    const PAGE_SIZE = 1000;
    let scansSeen = 0;
    for (let page = 0; ; page += 1) {
      const { data: scans, error } = await supabase
        .from("scans")
        .select("repo_full_name, risk_score, fragility_score, created_at")
        .gte("created_at", since)
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;
      if (!scans || scans.length === 0) break;

      for (const scan of scans) {
        const bucket = buckets.get(scan.repo_full_name) ?? {
          count: 0,
          riskSum: 0,
          riskMax: 0,
          fragilitySum: 0,
        };
        bucket.count += 1;
        bucket.riskSum += scan.risk_score;
        bucket.riskMax = Math.max(bucket.riskMax, scan.risk_score);
        bucket.fragilitySum += scan.fragility_score;
        buckets.set(scan.repo_full_name, bucket);
      }

      scansSeen += scans.length;
      if (scans.length < PAGE_SIZE) break;
    }

    const today = new Date().toISOString().slice(0, 10);
    const snapshots = Array.from(buckets.entries()).map(([repo, b]) => ({
      repo_full_name: repo,
      snapshot_date: today,
      scan_count: b.count,
      avg_risk_score: Math.round((b.riskSum / b.count) * 100) / 100,
      max_risk_score: b.riskMax,
      avg_fragility_score: Math.round((b.fragilitySum / b.count) * 100) / 100,
    }));

    if (snapshots.length > 0) {
      const { error: upsertError } = await supabase
        .from("repo_health_snapshots")
        .upsert(snapshots, { onConflict: "repo_full_name,snapshot_date" });

      if (upsertError) {
        throw upsertError;
      }
    }

    return NextResponse.json({
      ok: true,
      snapshotDate: today,
      repositories: snapshots.length,
      scansAggregated: scansSeen,
    });
  } catch (err) {
    // Verbose diagnostics stay server-side; the response is generic.
    console.error("[cron] repo health aggregation failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Constant-time bearer-token check against process.env.CRON_SECRET. */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: an unset secret means nobody gets in.
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const presented = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}
