import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { parsePullRequestUrl } from "@/lib/github";
import type { RiskLevel } from "@/lib/types";

/**
 * Open Graph card for public report links: when a report URL is pasted into
 * Slack/LinkedIn/Discord, the unfurl shows a rendered risk card instead of a
 * blank preview.
 *
 * The score/level ride in as query params written by the report page's
 * generateMetadata (which has the cached audit in hand) — this route stays a
 * pure renderer with no GitHub/Gemini/DB cost. Params are re-validated and
 * clamped, so a hand-crafted URL can at worst draw a differently-colored
 * picture.
 */

const LEVEL_STYLE: Record<RiskLevel, { color: string; label: string }> = {
  LOW: { color: "#22c55e", label: "LOW RISK" },
  MODERATE: { color: "#eab308", label: "MODERATE RISK" },
  HIGH: { color: "#f97316", label: "HIGH RISK" },
  CRITICAL: { color: "#ef4444", label: "CRITICAL RISK" },
};

const RISK_LEVELS = new Set<string>(["LOW", "MODERATE", "HIGH", "CRITICAL"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> }
) {
  const { owner, repo, number } = await params;

  let slug = "SlopShield";
  try {
    const ref = parsePullRequestUrl(`https://github.com/${owner}/${repo}/pull/${number}`);
    slug = `${ref.owner}/${ref.repo}#${ref.number}`;
  } catch {
    return new Response("invalid", { status: 400 });
  }

  const scoreRaw = Number(request.nextUrl.searchParams.get("score"));
  const hasScore = Number.isFinite(scoreRaw);
  const score = hasScore ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : null;

  const levelRaw = request.nextUrl.searchParams.get("level") ?? "";
  const level: RiskLevel = RISK_LEVELS.has(levelRaw) ? (levelRaw as RiskLevel) : "LOW";
  const style = score === null ? { color: "#64748b", label: "AUDIT PENDING" } : LEVEL_STYLE[level];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#09090b",
          backgroundImage: "radial-gradient(circle at 85% 15%, #1e293b55, transparent 55%)",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 12,
              backgroundColor: "#e2e8f0",
              color: "#09090b",
              fontSize: 30,
            }}
          >
            🛡️
          </div>
          <span style={{ color: "#f8fafc", fontSize: 34, fontWeight: 700 }}>SlopShield AI</span>
          <span
            style={{
              color: "#94a3b8",
              fontSize: 22,
              border: "1px solid #334155",
              borderRadius: 999,
              padding: "4px 16px",
            }}
          >
            PR behavioral audit
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ color: "#94a3b8", fontSize: 30, fontFamily: "monospace" }}>{slug}</span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
            <span style={{ color: "#f8fafc", fontSize: 130, fontWeight: 800, lineHeight: 1 }}>
              {score === null ? "—" : score}
              <span style={{ color: "#475569", fontSize: 54 }}>/100</span>
            </span>
            <span
              style={{
                color: style.color,
                border: `3px solid ${style.color}`,
                borderRadius: 16,
                padding: "10px 26px",
                fontSize: 40,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {style.label}
            </span>
          </div>
        </div>

        <span style={{ color: "#64748b", fontSize: 24 }}>
          Verdict from commit-timeline telemetry — the model never sees the diff.
        </span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}
