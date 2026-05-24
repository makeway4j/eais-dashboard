import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { renderDailyEmail } from "./template.mjs";

export async function renderToFile({ items, outputPath }) {
  const email = renderDailyEmail({ items });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, email.html, "utf8");
  return {
    ...email,
    outputPath
  };
}
