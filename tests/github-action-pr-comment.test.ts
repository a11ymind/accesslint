import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESSLINT_COMMENT_MARKER,
  findManagedComment,
  renderPullRequestComment,
} from "../src/pr-comment";
import type { ScanResult } from "../src/lib/scan";

const result: ScanResult = {
  url: "https://preview.example.com",
  finalUrl: "https://preview.example.com",
  passes: 3,
  incomplete: 1,
  inapplicable: 2,
  violations: [
    {
      id: "color-contrast",
      impact: "serious",
      description: "Elements must meet minimum color contrast ratio thresholds",
      help: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
      tags: [],
      nodes: [{ html: "<button>Save</button>", target: ["button"] }],
    },
    {
      id: "image-alt",
      impact: "minor",
      description: "Images must have alternate text",
      help: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      tags: [],
      nodes: [{ html: "<img />", target: ["img.hero"] }],
    },
  ],
};

test("PR comment renderer includes concise scan summary", () => {
  const body = renderPullRequestComment({
    url: result.finalUrl,
    score: 88,
    counts: { critical: 0, serious: 1, moderate: 0, minor: 1 },
    failOn: "serious",
    thresholdExceeded: true,
    result,
    jsonPath: ".accesslint/accesslint-report.json",
    markdownPath: ".accesslint/accesslint-summary.md",
  });

  assert.match(body, new RegExp(ACCESSLINT_COMMENT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, /## AccessLint summary/);
  assert.match(body, /Score: 88\/100/);
  assert.match(body, /Severity: Critical 0 \| Serious 1 \| Moderate 0 \| Minor 1/);
  assert.match(body, /Threshold result: exceeded/);
  assert.match(body, /JSON report: `\.accesslint\/accesslint-report\.json`/);
  assert.match(body, /Markdown report: `\.accesslint\/accesslint-summary\.md`/);
  assert.match(body, /\*\*serious\*\* Elements must meet minimum color contrast ratio thresholds/);
});

test("managed comment detection finds the existing AccessLint comment", () => {
  const comment = findManagedComment([
    { id: 1, body: "some other bot output" },
    { id: 2, body: `${ACCESSLINT_COMMENT_MARKER}\nold accesslint comment` },
  ]);

  assert.equal(comment?.id, 2);
});
