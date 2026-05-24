# Repository Guidelines

## Mission

This project builds a daily 6:00 AM HTML briefing for AI news, AI governance, major AI vendors, data center/infrastructure moves, and adjacent tech news. The system should run reliably from the home lab first, then grow into internal automation for social posting and job recommendations.

## Project Structure

- `src/jobs/` contains runnable job entry points.
- `src/fetch/` contains source ingestion code.
- `src/analyze/` contains classification, ranking, dedupe, and summarization logic.
- `src/email/` contains HTML rendering and future sending code.
- `src/config/` contains source lists, topic definitions, and thresholds.
- `prompts/` contains reusable AI prompts.
- `data/samples/` contains safe local fixtures for development.
- `data/cache/` is local runtime cache and should not be committed.
- `dist/` contains generated email previews and should not be committed.
- `docs/` contains architecture, provider choices, and operating notes.
- `scripts/` contains home-lab setup helpers.
- `tests/` contains smoke tests and behavior checks.

## Development Commands

- `npm run generate` renders a sample HTML email to `dist/daily-update.html`.
- `npm run daily` runs the current daily job.
- `npm test` runs the smoke checks.

The first version intentionally avoids required runtime dependencies so it can run on the home lab immediately. Add dependencies only when the integration needs them.

## Coding Style

- Use 2-space indentation for JavaScript, JSON, HTML, and CSS.
- Prefer small modules with clear boundaries.
- Keep source files lowercase and hyphenated when possible.
- Use `camelCase` for JavaScript values and functions.
- Keep generated output out of source folders.
- Do not commit secrets, local browser profiles, cache files, or generated newsletters.

## Operating Principles

- Home-lab reliability beats cleverness.
- Keep ingestion, analysis, rendering, sending, social posting, and jobs separate.
- Record source URLs and publish dates for every item that appears in the email.
- Do not invent facts. If source evidence is weak, mark the item as `watch`.
- Prefer official feeds, company blogs, government/regulator pages, SEC filings, reputable news outlets, and direct data center company announcements.
- Keep the email scannable: executive summary first, then sections, then links.

## AI Agent Workflow

Before editing:

1. Inspect the current tree and relevant files.
2. Preserve user-created work.
3. Keep changes scoped to the current task.
4. Update docs when commands, workflows, or architecture change.

When adding behavior:

1. Add or update a fixture in `data/samples/` when possible.
2. Add a smoke test or exact verification command.
3. Update `AI_REVIEW.md` with the change summary and any known gaps.

## Future Modules

The following are planned as separate modules:

- `social/` for LinkedIn and X/Twitter draft generation and posting.
- `jobs/` or `src/jobs-recs/` for job recommendation collection, ranking, and application tracking.
- `dashboard/` for a local home-lab web UI.

Do not blend those into the daily email pipeline until the digest core is stable.
