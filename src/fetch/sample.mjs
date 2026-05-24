import { readFile } from "node:fs/promises";

export async function loadSampleItems() {
  const raw = await readFile(new URL("../../data/samples/items.json", import.meta.url), "utf8");
  return JSON.parse(raw);
}
