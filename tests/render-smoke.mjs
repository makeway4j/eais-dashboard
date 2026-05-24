import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(projectRoot, "dist", "daily-update.html");

await execFileAsync(process.execPath, ["src/jobs/daily.mjs", "--sample"], {
  cwd: projectRoot
});

const output = await stat(outputPath);
if (!output.isFile() || output.size < 1000) {
  throw new Error("Expected generated HTML email to exist and contain substantial markup.");
}

const html = await readFile(outputPath, "utf8");
for (const requiredText of ["AI Daily Briefing", "AI Governance", "Major AI Vendors", "Data Centers"]) {
  if (!html.includes(requiredText)) {
    throw new Error(`Generated HTML is missing required text: ${requiredText}`);
  }
}

console.log("render smoke test passed");
