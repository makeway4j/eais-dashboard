import { envBool, envString } from "../config/env.mjs";

function configured(value) {
  return Boolean(String(value || "").trim());
}

function readinessLabel(ready, configuredButInactive) {
  if (ready) {
    return "ready";
  }
  if (configuredButInactive) {
    return "configured";
  }
  return "needs-config";
}

export function getEmailIntegrationStatus() {
  const sendMode = envString("EMAIL_SEND_MODE", "dry-run");
  const provider = envString("EMAIL_PROVIDER", "gmail_smtp");
  const host = envString("SMTP_HOST", "smtp.gmail.com");
  const port = envString("SMTP_PORT", "587");
  const secure = envBool("SMTP_SECURE", false);
  const fromConfigured = configured(envString("EMAIL_FROM"));
  const toConfigured = configured(envString("EMAIL_TO"));
  const userConfigured = configured(envString("SMTP_USER"));
  const passConfigured = configured(envString("SMTP_PASS"));
  const supportedProvider = ["gmail_smtp", "brevo_smtp"].includes(provider);
  const credentialsReady = supportedProvider && fromConfigured && toConfigured && userConfigured && passConfigured;

  return {
    provider,
    sendMode,
    host,
    port,
    secure,
    supportedProvider,
    fromConfigured,
    toConfigured,
    userConfigured,
    passConfigured,
    readyToSend: credentialsReady && sendMode === "send",
    status: readinessLabel(credentialsReady && sendMode === "send", credentialsReady),
    nextStep: credentialsReady
      ? "Run a manual send test, then leave EMAIL_SEND_MODE=send for the timer."
      : "Set EMAIL_FROM, EMAIL_TO, SMTP_USER, and SMTP_PASS in /opt/eais/.env."
  };
}

export function getJoplinIntegrationStatus() {
  const saveMode = envString("JOPLIN_SAVE_MODE", "off").toLowerCase();
  const localExportDir = envString("JOPLIN_LOCAL_EXPORT_DIR", "archives/joplin");
  const apiBase = envString("JOPLIN_API_BASE", "http://127.0.0.1:41184");
  const serverBase = envString("JOPLIN_SERVER_BASE", "http://127.0.0.1:22300");
  const tokenConfigured = configured(envString("JOPLIN_TOKEN"));
  const notebookConfigured = configured(envString("JOPLIN_NOTEBOOK_ID"));
  const localReady = saveMode === "local";
  const apiReady = saveMode === "api" && tokenConfigured;

  return {
    saveMode,
    localExportDir,
    apiBase,
    serverBase,
    tokenConfigured,
    notebookConfigured,
    readyToArchive: localReady || apiReady,
    status: readinessLabel(localReady || apiReady, saveMode === "api" && tokenConfigured),
    nextStep: apiReady
      ? "Run a manual dry-run and confirm the returned Joplin note id."
      : "Keep local archive on, or set JOPLIN_SAVE_MODE=api with JOPLIN_TOKEN and optional JOPLIN_NOTEBOOK_ID."
  };
}

export function getIntegrationStatus() {
  return {
    email: getEmailIntegrationStatus(),
    joplin: getJoplinIntegrationStatus()
  };
}
