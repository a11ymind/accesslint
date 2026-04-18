# AccessLint Changelog

This changelog tracks consumer-visible GitHub Action releases for `a11ymind/accesslint`.

## v1.0.0 (planned)

Initial public Action v1 scope:

- scan a single preview, staging, or live URL in CI
- compute an accessibility score from automated findings
- generate machine-readable JSON and human-readable Markdown reports
- expose stable output paths for artifact upload
- support `fail-on` thresholds: `none`, `minor`, `moderate`, `serious`, `critical`
- optionally post or update one concise pull request summary comment
- target GitHub-hosted Linux runners with Chrome available

Current non-goals:

- no AI fixes
- no crawling
- no monetization or API key model
