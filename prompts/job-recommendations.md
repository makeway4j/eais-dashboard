# Job Recommendations Prompt

This future module ranks jobs the user may want to apply for.

Rules:

- Do not run inside the daily digest path.
- Preserve the job URL, company, location, compensation, and posted date.
- Rank by fit, upside, application effort, and urgency.
- Flag jobs that look stale, vague, or low quality.

Return structured JSON with:

- `recommended`
- `maybe`
- `skip`
- `missingInformation`
