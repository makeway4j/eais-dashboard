import nodemailer from "nodemailer";
import { envBool, envString } from "../config/env.mjs";
import { log } from "../utils/logger.mjs";

function buildSmtpTransport() {
  const host = envString("SMTP_HOST", "smtp.gmail.com");
  const port = Number.parseInt(envString("SMTP_PORT", "587"), 10);
  const secure = envBool("SMTP_SECURE", false);
  const user = envString("SMTP_USER");
  const pass = envString("SMTP_PASS");

  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_PASS are required to send email.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

export async function sendEmail({ subject, html, forceSend = false }) {
  const sendMode = forceSend ? "send" : envString("EMAIL_SEND_MODE", "dry-run");
  const provider = envString("EMAIL_PROVIDER", "gmail_smtp");
  const from = envString("EMAIL_FROM");
  const to = envString("EMAIL_TO");

  if (sendMode !== "send") {
    await log("email send skipped", { mode: sendMode, provider, to });
    return { sent: false, mode: sendMode };
  }

  if (!from || !to) {
    throw new Error("EMAIL_FROM and EMAIL_TO are required to send email.");
  }

  if (!["gmail_smtp", "brevo_smtp"].includes(provider)) {
    throw new Error(`EMAIL_PROVIDER=${provider} is not implemented yet. Use gmail_smtp or brevo_smtp.`);
  }

  const transport = buildSmtpTransport();
  const info = await transport.sendMail({
    from,
    to,
    subject,
    html
  });

  await log("email sent", { provider, to, messageId: info.messageId });
  return { sent: true, messageId: info.messageId };
}
