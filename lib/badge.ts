import type { RiskLevel } from "@/lib/types";

/**
 * Renders a shields.io-style flat SVG badge for a risk verdict. Kept
 * dependency-free (hand-measured text widths) since this runs on every
 * cache-miss badge request and has no browser/canvas available.
 */

const LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: "#0ca30c",
  MODERATE: "#fab219",
  HIGH: "#ec835a",
  CRITICAL: "#d03b3b",
};

const CHAR_WIDTH = 6.5;
const PADDING = 10;
const HEIGHT = 20;

function textWidth(text: string): number {
  return Math.round(text.length * CHAR_WIDTH + PADDING * 2);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Builds a two-segment badge: a neutral label on the left, a colored value on the right. */
export function renderBadgeSvg(label: string, value: string, color: string): string {
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(value);
  const totalWidth = labelWidth + valueWidth;
  const labelX = labelWidth / 2;
  const valueX = labelWidth + valueWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${HEIGHT}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${color}"/>
    <rect width="${totalWidth}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelX}" y="14">${escapeXml(label)}</text>
    <text x="${valueX}" y="14">${escapeXml(value)}</text>
  </g>
</svg>`;
}

export function renderRiskBadge(riskScore: number, riskLevel: RiskLevel): string {
  return renderBadgeSvg("slop risk", `${riskScore}/100 ${riskLevel}`, LEVEL_COLOR[riskLevel]);
}

export function renderErrorBadge(message: string): string {
  return renderBadgeSvg("slopshield", message, "#999");
}

export function renderPendingBadge(): string {
  return renderBadgeSvg("slopshield", "rate limited, retry soon", "#999");
}
