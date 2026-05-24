# Email Provider Decision

## Recommendation

Start with Gmail/SMTP if this only sends one email to yourself every morning. It is the cheapest path because it uses an account you likely already have.

If you want a proper transactional provider with logs, a cleaner API, and room to scale, start with Brevo. Its free plan is generous enough for a personal daily digest, and it supports SMTP/API workflows.

## Provider Notes

- Gmail/SMTP: lowest cost for a personal digest, but limited observability and not ideal for scaled automation.
- Brevo: good free starting point for daily sends and future contact growth.
- Resend: very developer-friendly, but the paid plan is more expensive than Brevo once you outgrow the free tier.
- SendGrid: established, but its paid entry point is higher than Brevo.

## Initial Project Setting

Use this in `.env` for the first live send:

```env
EMAIL_PROVIDER=gmail_smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

If Gmail setup gets annoying or deliverability is weak, switch to:

```env
EMAIL_PROVIDER=brevo_smtp
```

Always verify current provider pricing before depending on a free tier.
