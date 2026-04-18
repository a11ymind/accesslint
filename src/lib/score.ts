import type { AxeViolation } from "./scan";

const WEIGHTS: Record<string, number> = {
  critical: 8,
  serious: 4,
  moderate: 2,
  minor: 1,
};

export function computeScore(violations: AxeViolation[]): number {
  const deduction = violations.reduce((sum, v) => {
    const w = WEIGHTS[v.impact ?? "minor"] ?? 1;
    const count = Math.max(1, v.nodes?.length ?? 1);
    return sum + w * count;
  }, 0);
  return Math.max(0, Math.min(100, 100 - deduction));
}

export function scoreBand(score: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (score >= 85) return { label: "Low risk", tone: "good" };
  if (score >= 60) return { label: "Needs work", tone: "warn" };
  return { label: "High risk", tone: "bad" };
}
