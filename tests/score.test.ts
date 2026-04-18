import test from "node:test";
import assert from "node:assert/strict";
import { computeScore, scoreBand } from "../src/lib/score";

test("computeScore applies severity weights and node counts", () => {
  const score = computeScore([
    {
      id: "color-contrast",
      impact: "serious",
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [{ html: "", target: ["body"] }, { html: "", target: ["main"] }],
    },
    {
      id: "image-alt",
      impact: "moderate",
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [{ html: "", target: ["img"] }],
    },
  ]);

  assert.equal(score, 90);
});

test("computeScore clamps between 0 and 100 and treats null impact as minor", () => {
  const score = computeScore([
    {
      id: "null-impact",
      impact: null,
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [],
    },
    {
      id: "huge-deduction",
      impact: "critical",
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: Array.from({ length: 30 }, () => ({ html: "", target: ["*"] })),
    },
  ]);

  assert.equal(score, 0);
});

test("scoreBand maps score ranges to the expected labels", () => {
  assert.deepEqual(scoreBand(90), { label: "Low risk", tone: "good" });
  assert.deepEqual(scoreBand(70), { label: "Needs work", tone: "warn" });
  assert.deepEqual(scoreBand(40), { label: "High risk", tone: "bad" });
});
