# AI Review Workflow

## Roles

Codex/OpenAI:

- Plan architecture.
- Implement features.
- Run local verification.
- Keep docs current.

Claude Code:

- Review diffs.
- Look for bugs, brittle prompts, missing tests, unclear boundaries, and home-lab reliability risks.
- Recommend focused fixes.

## Loop

1. Codex implements a small change.
2. Codex updates `AI_REVIEW.md`.
3. Codex runs the documented checks.
4. Claude reviews the diff.
5. Codex applies accepted fixes.
6. The final handoff records exact commands and results.

## Review Prompt

Use this with Claude Code:

```text
Review this repo as a home-lab daily AI briefing system. Focus on bugs, reliability risks, missing tests, unclear source handling, secret leakage, and whether future social/job modules are kept separate from the core email job. Give file/line findings first, then exact recommended fixes.
```
