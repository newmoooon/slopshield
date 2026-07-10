import { describe, expect, it } from "vitest";
import { normalizeAudit } from "@/lib/gemini";

const valid = {
  riskScore: 62,
  riskLevel: "HIGH",
  reviewerWarning: "Velocity is extreme. Review the largest file first.",
  fragilityScore: 55,
  keySignals: ["60k lines/hour velocity", "zero test movement", "single-file dump"],
};

describe("normalizeAudit", () => {
  it("passes a well-formed audit through unchanged", () => {
    expect(normalizeAudit(valid)).toEqual(valid);
  });

  it("clamps out-of-range scores into 0–100", () => {
    const audit = normalizeAudit({ ...valid, riskScore: 250, fragilityScore: -40 });
    expect(audit.riskScore).toBe(100);
    expect(audit.fragilityScore).toBe(0);
  });

  it("coerces numeric strings and zeroes non-numeric scores", () => {
    const audit = normalizeAudit({ ...valid, riskScore: "88", fragilityScore: "banana" });
    expect(audit.riskScore).toBe(88);
    expect(audit.fragilityScore).toBe(0);
  });

  it("derives riskLevel from the score when the model returns an invalid band", () => {
    expect(normalizeAudit({ ...valid, riskScore: 80, riskLevel: "APOCALYPTIC" }).riskLevel).toBe("CRITICAL");
    expect(normalizeAudit({ ...valid, riskScore: 60, riskLevel: 42 }).riskLevel).toBe("HIGH");
    expect(normalizeAudit({ ...valid, riskScore: 30, riskLevel: null }).riskLevel).toBe("MODERATE");
    expect(normalizeAudit({ ...valid, riskScore: 5, riskLevel: undefined }).riskLevel).toBe("LOW");
  });

  it("substitutes a fallback warning for blank or non-string warnings", () => {
    for (const reviewerWarning of ["", "   ", 7, null]) {
      const audit = normalizeAudit({ ...valid, reviewerWarning });
      expect(audit.reviewerWarning).toMatch(/manually/i);
    }
  });

  it("caps an overlong warning at 600 characters", () => {
    const audit = normalizeAudit({ ...valid, reviewerWarning: "x".repeat(2000) });
    expect(audit.reviewerWarning).toHaveLength(600);
  });

  it("filters non-string signals, trims, drops empties, and caps at five", () => {
    const audit = normalizeAudit({
      ...valid,
      keySignals: ["  one  ", 2, null, "", "three", "four", "five", "six", "seven"],
    });
    expect(audit.keySignals).toEqual(["one", "three", "four", "five", "six"]);
  });

  it("degrades keySignals to [] when the model omits the array", () => {
    expect(normalizeAudit({ ...valid, keySignals: "not-an-array" }).keySignals).toEqual([]);
  });

  it("rejects non-object payloads outright", () => {
    expect(() => normalizeAudit(null)).toThrow();
    expect(() => normalizeAudit("{}")).toThrow();
  });
});
