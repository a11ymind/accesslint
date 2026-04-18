import test from "node:test";
import assert from "node:assert/strict";
import {
  formatSuccessMessage,
  buildJsonReport,
  countSeverities,
  parseBooleanInput,
  parseFailOn,
  renderMarkdownReport,
  thresholdExceeded,
} from "../src/report";
import type { ScanResult } from "../src/lib/scan";

const result: ScanResult = {
  url: "https://preview.example.com",
  finalUrl: "https://preview.example.com",
  passes: 10,
  incomplete: 1,
  inapplicable: 4,
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
      nodes: [
        { html: '<img src="/hero.png" />', target: ["img.hero"] },
        { html: '<img src="/logo.png" />', target: ["img.logo"] },
      ],
    },
  ],
};

test("report helpers parse booleans and fail-on thresholds safely", () => {
  assert.equal(parseBooleanInput("true", false), true);
  assert.equal(parseBooleanInput("0", true), false);
  assert.equal(parseBooleanInput("unexpected", true), true);

  assert.equal(parseFailOn("critical"), "critical");
  assert.equal(parseFailOn("weird"), "serious");
});

test("report helpers count severities and evaluate thresholds", () => {
  const counts = countSeverities(result.violations);
  assert.deepEqual(counts, {
    critical: 0,
    serious: 1,
    moderate: 0,
    minor: 1,
  });

  assert.equal(thresholdExceeded(result.violations, "none"), false);
  assert.equal(thresholdExceeded(result.violations, "critical"), false);
  assert.equal(thresholdExceeded(result.violations, "serious"), true);
  assert.equal(thresholdExceeded(result.violations, "minor"), true);
});

test("report helpers render markdown and JSON artifacts", () => {
  const counts = countSeverities(result.violations);
  const markdown = renderMarkdownReport({
    url: result.url,
    finalUrl: result.finalUrl,
    score: 87,
    failOn: "serious",
    counts,
    thresholdExceeded: true,
    result,
  });

  assert.match(markdown, /# AccessLint scan summary/);
  assert.match(markdown, /Accessibility score: 87\/100/);
  assert.match(markdown, /\*\*serious\*\* Elements must meet minimum color contrast ratio thresholds/);

  const json = buildJsonReport({
    url: result.url,
    finalUrl: result.finalUrl,
    score: 87,
    failOn: "serious",
    counts,
    thresholdExceeded: true,
    result,
  });

  assert.equal(json.summary.totalRisks, 2);
  assert.equal(json.summary.serious, 1);
  assert.equal(json.thresholdExceeded, true);
  assert.deepEqual(json.violations[1]?.targets, ["img.hero", "img.logo"]);
});

test("report helpers format a concise success summary", () => {
  const message = formatSuccessMessage({
    score: 87,
    totalRisks: 2,
    counts: {
      critical: 0,
      serious: 1,
      moderate: 0,
      minor: 1,
    },
    thresholdExceeded: true,
    failOn: "serious",
  });

  assert.match(message, /score 87\/100/);
  assert.match(message, /Critical 0 \| Serious 1 \| Moderate 0 \| Minor 1/);
  assert.match(message, /threshold \(serious\) was exceeded/);
  assert.match(message, /AccessLint scan complete/);
});
