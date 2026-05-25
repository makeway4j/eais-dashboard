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

async function probeJson(url, options = {}, label = url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 160);
    }

    return {
      url: label,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      body,
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

function summarizeChildrenProbe(probe) {
  if (!probe.body?.items) return probe;
  return {
    ...probe,
    body: {
      itemCountSample: probe.body.items.length,
      hasMore: Boolean(probe.body.has_more),
      firstNames: probe.body.items.slice(0, 5).map((item) => item.name)
    }
  };
}

function joinUrl(base, path) {
  return `${base.replace(/\/$/, "")}${path}`;
}

async function resolveServerAuth(serverBase) {
  const serverToken = envString("JOPLIN_SERVER_TOKEN");
  const serverEmail = envString("JOPLIN_SERVER_EMAIL");
  const serverPassword = envString("JOPLIN_SERVER_PASSWORD");

  if (serverToken) {
    return {
      source: "token",
      token: serverToken,
      probe: {
        configured: true,
        source: "token",
        ok: true
      }
    };
  }

  if (!serverEmail || !serverPassword) {
    return {
      source: "none",
      token: "",
      probe: {
        configured: false,
        source: "none",
        ok: false,
        nextStep: "Set JOPLIN_SERVER_TOKEN or JOPLIN_SERVER_EMAIL/JOPLIN_SERVER_PASSWORD."
      }
    };
  }

  const loginProbe = await probeJson(joinUrl(serverBase, "/api/sessions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-MIN-VERSION": "2.6.0"
    },
    body: JSON.stringify({
      email: serverEmail,
      password: serverPassword,
      platform: 3,
      version: "EAIS"
    })
  });
  const sessionId = loginProbe.ok && loginProbe.body?.id ? loginProbe.body.id : "";

  return {
    source: "session",
    token: sessionId,
    probe: {
      ...loginProbe,
      body: loginProbe.body?.id ? { id: "REDACTED", user_id: loginProbe.body.user_id || null } : loginProbe.body
    }
  };
}

await loadEnv();

const status = getJoplinIntegrationStatus();
const apiBase = envString("JOPLIN_API_BASE", status.apiBase);
const serverBase = envString("JOPLIN_SERVER_BASE", status.serverBase);
const token = envString("JOPLIN_TOKEN");
const apiNotesPath = token ? `/notes?token=${encodeURIComponent(token)}` : "/notes";
const apiNotesLabel = joinUrl(apiBase, token ? "/notes?token=REDACTED" : "/notes");
const serverAuth = await resolveServerAuth(serverBase);
const serverHeaders = serverAuth.token
  ? {
      "X-API-AUTH": serverAuth.token,
      "X-API-MIN-VERSION": "2.6.0"
    }
  : {
      "X-API-MIN-VERSION": "2.6.0"
    };

const probes = {
  dataApiPing: await probeUrl(joinUrl(apiBase, "/ping")),
  dataApiNotes: await probeUrl(joinUrl(apiBase, apiNotesPath), apiNotesLabel),
  joplinServerRoot: await probeUrl(joinUrl(serverBase, "/")),
  joplinServerApiPing: await probeUrl(joinUrl(serverBase, "/api/ping")),
  joplinServerAuth: serverAuth.probe,
  joplinServerChildren: summarizeChildrenProbe(await probeJson(joinUrl(serverBase, "/api/items/root:/:/children?limit=5"), {
    headers: serverHeaders
  }))
};
const serverAuthUsable = Boolean(serverAuth.token && probes.joplinServerChildren.ok);

console.log(JSON.stringify({
  status,
  probes,
  interpretation: {
    dataApiUsable: probes.dataApiPing.ok || probes.dataApiNotes.status === 200,
    serverReachable: Boolean(probes.joplinServerRoot.status || probes.joplinServerApiPing.status),
    serverAuthUsable,
    nextStep: serverAuthUsable
      ? "Joplin Server auth is usable. Run a server-mode dry-run archive and confirm the returned note id."
      : "Use JOPLIN_SAVE_MODE=local until Joplin Server auth and sync-item write behavior are confirmed. The desktop Data API uses /notes; Joplin Server uses X-API-AUTH and serialized sync items."
  }
}, null, 2));
