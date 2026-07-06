import "server-only";

import { GoogleGenAI, Type } from "@google/genai";
import type {
  CrunchedMetrics,
  GeminiAudit,
  PullRequestMetadata,
  RiskLevel,
} from "@/lib/types";

/**
 * The AI Brain.
 *
 * Crunched behavioral metrics are piped into Gemini 2.5 Flash with a strict
 * JSON response schema, so the verdict is always machine-parseable — no
 * regex-scraping of prose. Gemini is prompted as a Principal DevOps Auditor
 * judging *telemetry*, never raw code, which keeps the request tiny and the
 * signal orthogonal to text-based AI detectors that slop authors already evade.
 */

const MODEL = "gemini-2.5-flash";

const RISK_LEVELS: readonly RiskLevel[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    riskScore: {
      type: Type.INTEGER,
      description:
        "AI Slop Risk Score, 0 (unmistakably human craftsmanship) to 100 (near-certain unreviewed AI dump).",
    },
    riskLevel: {
      type: Type.STRING,
      enum: [...RISK_LEVELS],
      description: "Categorical risk band consistent with riskScore.",
    },
    reviewerWarning: {
      type: Type.STRING,
      description:
        "Exactly two concise sentences a human reviewer reads before opening the diff.",
    },
    fragilityScore: {
      type: Type.INTEGER,
      description:
        "Predictive Maintenance Fragility Score, 0-100: likelihood this change becomes a churn hotspot requiring rework within two quarters.",
    },
    keySignals: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Three short bullet phrases naming the strongest telemetry signals behind the verdict.",
    },
  },
  required: [
    "riskScore",
    "riskLevel",
    "reviewerWarning",
    "fragilityScore",
    "keySignals",
  ],
} as const;

const SYSTEM_INSTRUCTION = `You are a Principal DevOps Auditor at a Fortune 500 platform-engineering org.
You detect "AI slop" — low-quality, pasted AI-generated code — from Pull Request behavioral telemetry alone. You never see the code itself.

Calibration guidance:
- Human PRs typically show < 150 lines added/hour sustained velocity, meaningful deletions (dominance 0.5-0.9), churn under ~300 lines/file, and tests moving with source.
- Slop signatures: extreme velocity (> 500 lines/hour), addition dominance near 1.0, a single huge generated file, zero test movement, and a dev window of minutes for thousands of lines.
- Small PRs (< 50 lines) are rarely slop regardless of velocity; weight sample size accordingly.
- riskLevel bands: LOW 0-24, MODERATE 25-49, HIGH 50-74, CRITICAL 75-100. Keep riskLevel consistent with riskScore.
- The reviewerWarning must be exactly two sentences, direct and specific to the numbers provided.`;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function auditPullRequest(
  pr: PullRequestMetadata,
  metrics: CrunchedMetrics
): Promise<GeminiAudit> {
  const telemetry = {
    repository: `${pr.ref.owner}/${pr.ref.repo}`,
    prTitle: pr.title,
    linesAdded: pr.additions,
    linesDeleted: pr.deletions,
    filesChanged: pr.changedFiles,
    commitCount: pr.commitCount,
    devWindowHours: metrics.devWindowHours,
    codeVelocityLinesAddedPerHour: metrics.codeVelocityPerHour,
    churnPerFile: metrics.churnPerFile,
    additionDominance: metrics.additionDominance,
    testFileRatio: metrics.testFileRatio,
    largestSingleFileAdditions: metrics.largestFileAdditions,
  };

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: `Audit this Pull Request telemetry and return your verdict.\n\n${JSON.stringify(telemetry, null, 2)}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: AUDIT_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return normalizeAudit(JSON.parse(text));
}

/**
 * Defense-in-depth on model output: even with a response schema, every field
 * is re-validated and clamped before it touches the database or the UI.
 */
function normalizeAudit(raw: unknown): GeminiAudit {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Gemini response is not an object");
  }
  const candidate = raw as Record<string, unknown>;

  const riskScore = clampInt(candidate.riskScore, 0, 100);
  const fragilityScore = clampInt(candidate.fragilityScore, 0, 100);

  const riskLevel = RISK_LEVELS.includes(candidate.riskLevel as RiskLevel)
    ? (candidate.riskLevel as RiskLevel)
    : scoreToLevel(riskScore);

  const reviewerWarning =
    typeof candidate.reviewerWarning === "string" &&
    candidate.reviewerWarning.trim().length > 0
      ? candidate.reviewerWarning.trim().slice(0, 600)
      : "Telemetry audit completed without a narrative summary. Review the metric grid manually before merging.";

  const keySignals = Array.isArray(candidate.keySignals)
    ? candidate.keySignals
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().slice(0, 160))
        .filter((s) => s.length > 0)
        .slice(0, 5)
    : [];

  return { riskScore, riskLevel, reviewerWarning, fragilityScore, keySignals };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MODERATE";
  return "LOW";
}
