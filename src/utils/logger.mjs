import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function log(message, details = {}) {
  const timestamp = new Date().toISOString();
  const line = JSON.stringify({ timestamp, message, ...details });
  console.log(line);

  await mkdir(resolve("logs"), { recursive: true });
  await appendFile(resolve("logs", `${today()}.log`), `${line}\n`, "utf8");
}

export async function logError(message, error, details = {}) {
  await log(message, {
    level: "error",
    error: error?.message || String(error),
    stack: error?.stack,
    ...details
  });
}
