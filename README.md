# AccessLint GitHub Action v1

AccessLint is a lightweight JavaScript GitHub Action for scanning a preview or live URL in CI before deployment.

Catch accessibility risks on a single preview, staging, or live URL before code merges or deploys.

This repository is public and source-available under the Business Source
License 1.1 (`BUSL-1.1`). The code converts to `Apache-2.0` on `2029-04-19`.
See [LICENSE](LICENSE) for the exact terms, including the current production
use grant and the restriction on offering a competing hosted service before the
change date.

It complements the main a11ymind product:

- a11ymind app: post-deploy monitoring, saved sites, alerts, dashboards, reports
- AccessLint: pre-deploy CI scan helper for preview URLs

## Features

- scan one URL in CI
- generate JSON and Markdown reports
- fail the job on configurable severity thresholds
- optionally post or update a concise pull request summary comment

## What v1 does

- scans one preview or live URL
- runs automated axe-based accessibility checks
- computes an accessibility score
- writes optional JSON and Markdown reports into the workspace
- adds a GitHub Actions job summary
- can fail the workflow step when risks at or above a configured severity are found

## Current v1 scope

This action is intentionally small and developer-facing. It is meant to help engineering teams catch accessibility risks during CI for a single deployed URL.

## Release and versioning

Recommended GitHub Action release strategy:

- cut immutable semantic version tags such as `v1.0.0`, `v1.0.1`, `v1.1.0`
- move the major tag `v1` to the latest stable `v1.x.y` release
- keep consumer examples on `uses: a11ymind/accesslint@v1`

Practical release notes:

- keep `action.yml` at the repository root
- keep `dist/index.js` committed so consumers do not need a build step
- rebuild the bundle with `npm run action:build` before tagging a release
- run `npm run test`, `npm run build`, and `npm run typecheck` before cutting tags

See [CHANGELOG.md](CHANGELOG.md) for the current v1 release summary.

## Quick start

For another repository, use `uses: a11ymind/accesslint@v1`.

```yaml
name: Accessibility scan

on:
  pull_request:
  push:
    branches: [main]

jobs:
  accesslint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Run AccessLint
        id: accesslint
        uses: a11ymind/accesslint@v1
        with:
          url: https://preview.example.com
          fail-on: serious
          output-json: true
          output-markdown: true

      - name: Upload AccessLint artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: accesslint-report
          path: |
            ${{ steps.accesslint.outputs.json-path }}
            ${{ steps.accesslint.outputs.markdown-path }}
```

This keeps the action simple in consumer repos:

- scan one preview, staging, or live URL
- fail the job only when the chosen severity threshold is exceeded
- always upload the JSON and Markdown reports for inspection

## Test from another repository

Use this minimal workflow in another repository to validate external consumption through `a11ymind/accesslint@v1`.

```yaml
name: AccessLint smoke

on:
  workflow_dispatch:

jobs:
  accesslint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Run AccessLint
        id: accesslint
        uses: a11ymind/accesslint@v1
        with:
          url: https://www.example.com
          fail-on: none

      - name: Upload AccessLint artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: accesslint-report
          path: |
            ${{ steps.accesslint.outputs.json-path }}
            ${{ steps.accesslint.outputs.markdown-path }}
```

Notes:

- start with `fail-on: none` for a simple external smoke test
- v1 is best suited to GitHub-hosted Ubuntu runners
- add `pull-requests: write` only if you want PR comments

## Pull request comments

AccessLint can optionally post a concise summary comment on the triggering pull request and update that same comment on later runs.

Required workflow permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Example:

```yaml
name: Accessibility scan

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  accesslint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Run AccessLint
        id: accesslint
        uses: a11ymind/accesslint@v1
        with:
          url: https://preview.example.com
          fail-on: serious
          comment-pr: true

      - name: Upload AccessLint artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: accesslint-report
          path: |
            ${{ steps.accesslint.outputs.json-path }}
            ${{ steps.accesslint.outputs.markdown-path }}
```

Notes:

- PR comments are opt-in through `comment-pr: true`
- they only run in `pull_request` or `pull_request_target` context
- AccessLint updates a single managed comment in place instead of posting duplicates
- the comment includes the relative JSON and Markdown report paths when those outputs are enabled
- if permissions or token access are missing, the scan still completes and the comment is skipped with a warning

## Runner expectation

- v1 is best suited to GitHub-hosted Linux runners such as `ubuntu-latest`
- it expects Chrome to be available on the runner
- it does not use the Vercel serverless Chromium path from the main a11ymind app

## Non-goals for v1

- no rich PR review annotations beyond the optional summary comment
- no AI fixes
- no crawling
- no monetization or API key model yet

## Inputs

### `url`

Required preview or live URL to scan.

### `fail-on`

Optional severity threshold that fails the step when matched.

Allowed values:

- `none`
- `minor`
- `moderate`
- `serious`
- `critical`

Default: `serious`

### `output-json`

Optional. Write a machine-readable JSON report file into the workspace.

Default: `true`

### `output-markdown`

Optional. Write a human-readable Markdown summary file into the workspace.

Default: `true`

### `output-dir`

Optional directory where generated files are written.

Default: `.accesslint`

### `comment-pr`

Optional. Post or update a concise summary comment on the triggering pull request.

Default: `false`

### `github-token`

Optional. GitHub token used for PR comments.

Default: `${{ github.token }}`

## Outputs

- `score`: accessibility score from `0` to `100`
- `total-risks`: total detected accessibility risks
- `critical-count`: count of critical risks
- `serious-count`: count of serious risks
- `moderate-count`: count of moderate risks
- `minor-count`: count of minor risks
- `json-path`: path to `accesslint-report.json`, or empty when disabled
- `markdown-path`: path to `accesslint-summary.md`, or empty when disabled
- `threshold-exceeded`: `true` or `false`

## Fail-on behavior

- `none`: never fail the step because of findings
- `minor`: fail on any detected risk
- `moderate`: fail on moderate, serious, or critical risks
- `serious`: fail on serious or critical risks
- `critical`: fail only on critical risks

The step still writes reports and a job summary before failing on the configured threshold.

## Generated report files

By default the action writes:

- `.accesslint/accesslint-report.json`
- `.accesslint/accesslint-summary.md`

If you change `output-dir`, the filenames remain the same and only the directory changes.

## Limitations

- scans one URL only
- no authenticated/session-aware scanning flow yet
- no crawling across multiple pages
- PR comments are summary-only and opt-in
- no AI remediation output yet
- currently best suited to GitHub-hosted Linux runners with Chrome available
