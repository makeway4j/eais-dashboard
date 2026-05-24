# Claude Code Instructions

You are reviewing and improving `html-dailyupdate`, a home-lab automation project that sends a daily 6:00 AM HTML briefing about AI news, AI governance, major vendors, data centers, and related technology infrastructure.

## Priorities

1. Keep the system reliable for an always-on home lab.
2. Preserve the digest pipeline boundaries: fetch, analyze, render, send.
3. Keep future LinkedIn/X posting and job recommendations separate from the core email job.
4. Prefer small, verifiable changes over broad rewrites.
5. Never add secrets to the repository.
6. Align with the root homelab context in `C:\JCW_3\CLAUDE.md`.

## Review Style

When asked to review:

- Start with bugs, risks, regressions, and missing tests.
- Cite exact files and lines when possible.
- Separate confirmed problems from suggestions.
- Include exact commands used for verification.
- If the change is acceptable, say so directly.

## Implementation Notes

- The current project uses Node ESM and has no required production dependencies.
- `npm run generate` should produce `dist/daily-update.html`.
- `npm test` should run the smoke check.
- `.env.example` documents planned secrets and provider choices.
- The root homelab TODO calls for upgrading the morning digest to an HTML email via Gmail SMTP, styled like Google "Your day ahead."
- No `brief.py` was found under `C:\JCW_3` on 2026-05-24, so treat this project as the clean successor unless the legacy script is later found.

## Do Not Do

- Do not merge social posting into the email rendering path.
- Do not scrape sites aggressively.
- Do not assume pricing or API terms are current without checking.
- Do not overwrite generated samples unless the task asks for it.
- Do not commit `dist/`, `data/cache/`, `.env`, or local logs.
