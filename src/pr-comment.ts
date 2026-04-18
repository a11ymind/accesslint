import { readFileSync } from "node:fs";
import type { AxeViolation, ScanResult } from "./lib/scan";
import type { FailOn, SeverityCounts } from "./report";

export const ACCESSLINT_COMMENT_MARKER = "<!-- accesslint-pr-comment -->";

type PullRequestContext = {
  owner: string;
  repo: string;
  issueNumber: number;
};

type PullRequestCommentInput = {
  url: string;
  score: number;
  counts: SeverityCounts;
  failOn: FailOn;
  thresholdExceeded: boolean;
  result: ScanResult;
  jsonPath: string;
  markdownPath: string;
};

type GitHubIssueComment = {
  id: number;
  body: string;
  user?: {
    type?: string;
    login?: string;
  };
};

export function renderPullRequestComment(input: PullRequestCommentInput) {
  const topViolations = [...input.result.violations]
    .sort(
      (a, b) =>
        impactWeight(b.impact) - impactWeight(a.impact) ||
        a.help.localeCompare(b.help),
    )
    .slice(0, 3);

  const lines = [
    ACCESSLINT_COMMENT_MARKER,
    "## AccessLint summary",
    "",
    `- URL: ${input.url}`,
    `- Score: ${input.score}/100`,
    `- Risks: ${input.result.violations.length}`,
    `- Severity: Critical ${input.counts.critical} | Serious ${input.counts.serious} | Moderate ${input.counts.moderate} | Minor ${input.counts.minor}`,
    `- Fail-on threshold: ${input.failOn}`,
    `- Threshold result: ${input.thresholdExceeded ? "exceeded" : "not exceeded"}`,
    `- JSON report: ${input.jsonPath ? `\`${input.jsonPath}\`` : "disabled"}`,
    `- Markdown report: ${input.markdownPath ? `\`${input.markdownPath}\`` : "disabled"}`,
    "",
    "### Top risks",
    "",
  ];

  if (topViolations.length === 0) {
    lines.push("- No automated accessibility risks were detected on this scan.");
  } else {
    for (const violation of topViolations) {
      const impact = normalizeImpact(violation.impact);
      lines.push(
        `- **${impact}** ${violation.help} (${violation.nodes.length} node${violation.nodes.length === 1 ? "" : "s"})`,
      );
    }
  }

  lines.push(
    "",
    "_AccessLint updates this comment in place on later runs for the same pull request._",
  );

  return lines.join("\n");
}

export function findManagedComment(comments: GitHubIssueComment[]) {
  return comments.find((comment) => comment.body.includes(ACCESSLINT_COMMENT_MARKER));
}

export async function upsertPullRequestComment(params: {
  token: string;
  body: string;
}) {
  const context = readPullRequestContext();
  if (!context) return "skipped";

  const comments = await githubRequest<GitHubIssueComment[]>({
    token: params.token,
    method: "GET",
    path: `/repos/${context.owner}/${context.repo}/issues/${context.issueNumber}/comments?per_page=100`,
  });

  const existing = findManagedComment(comments);

  if (existing) {
    await githubRequest({
      token: params.token,
      method: "PATCH",
      path: `/repos/${context.owner}/${context.repo}/issues/comments/${existing.id}`,
      body: { body: params.body },
    });
    return "updated";
  }

  await githubRequest({
    token: params.token,
    method: "POST",
    path: `/repos/${context.owner}/${context.repo}/issues/${context.issueNumber}/comments`,
    body: { body: params.body },
  });
  return "created";
}

export function readPullRequestContext(): PullRequestContext | null {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName !== "pull_request" && eventName !== "pull_request_target") {
    return null;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!repository || !eventPath) return null;

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) return null;

  try {
    const payload = JSON.parse(readFileSync(eventPath, "utf8")) as {
      number?: number;
      pull_request?: { number?: number };
    };
    const issueNumber = payload.pull_request?.number ?? payload.number;
    if (!issueNumber) return null;
    return { owner, repo, issueNumber };
  } catch {
    return null;
  }
}

async function githubRequest<T = unknown>(params: {
  token: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
}) {
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const response = await fetch(`${apiUrl}${params.path}`, {
    method: params.method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
      "User-Agent": "accesslint-action",
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API ${params.method} ${params.path} failed with ${response.status}. ${text}`.trim(),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeImpact(value: AxeViolation["impact"]) {
  return value === "critical" ||
    value === "serious" ||
    value === "moderate" ||
    value === "minor"
    ? value
    : "minor";
}

function impactWeight(value: AxeViolation["impact"]) {
  switch (normalizeImpact(value)) {
    case "critical":
      return 4;
    case "serious":
      return 3;
    case "moderate":
      return 2;
    case "minor":
      return 1;
  }
}
