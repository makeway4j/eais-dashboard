import { loadEnv, envString } from "../config/env.mjs";
import { getJoplinIntegrationStatus } from "../integrations/status.mjs";

async function probeUrl(url, label = url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return {
      url: label,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      url: label,
      ok: false,
      error: error?.cause?.code || error?.name || "FetchError",
      message: error?.message || String(error),
      elapsedMs: Date.now() - startedAt
    };
  }
}

function joinUrl(base, path) {
  return `${base.replace(/\/$/, "")}${path}`;
}

await loadEnv();

const status = getJoplinIntegrationStatus();
const apiBase = envString("JOPLIN_API_BASE", status.apiBase);
const serverBase = envString("JOPLIN_SERVER_BASE", status.serverBase);
const token = envString("JOPLIN_TOKEN");
const apiNotesPath = token ? `/notes?token=${encodeURIComponent(token)}` : "/notes";
const apiNotesLabel = joinUrl(apiBase, token ? "/notes?token=REDACTED" : "/notes");

const probes = {
  dataApiPing: await probeUrl(joinUrl(apiBase, "/ping")),
  dataApiNotes: await probeUrl(joinUrl(apiBase, apiNotesPath), apiNotesLabel),
  joplinServerRoot: await probeUrl(joinUrl(serverBase, "/")),
  joplinServerApiPing: await probeUrl(joinUrl(serverBase, "/api/ping"))
};

console.log(JSON.stringify({
  status,
  probes,
  interpretation: {
    dataApiUsable: probes.dataApiPing.ok || probes.dataApiNotes.status === 200,
    serverReachable: Boolean(probes.joplinServerRoot.status || probes.joplinServerApiPing.status),
    nextStep: "EAIS note creation uses the Joplin Data API. If the server is reachable but Data API is refused, run/enable a Joplin desktop or terminal clipper/API service and expose that API to CT 301, or add a separate Joplin Server sync bridge."
  }
}, null, 2));
