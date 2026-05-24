import { loadEnv } from "../config/env.mjs";
import { getIntegrationStatus } from "../integrations/status.mjs";

await loadEnv();

console.log(JSON.stringify(getIntegrationStatus(), null, 2));
