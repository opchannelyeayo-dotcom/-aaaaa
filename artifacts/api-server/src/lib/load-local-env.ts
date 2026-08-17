import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Replit, PORT / DATABASE_URL / OPENAI_API_KEY etc. are injected into
// process.env automatically by the platform, so this file is a no-op there
// (no .env file exists in the repo). When running locally (outside Replit),
// nothing injects those vars, so we read a `.env` file at the repo root
// (copy `.env.example` to get started) and fill in anything not already
// set. Existing process.env values always win — this never overrides a
// value the environment already provided.
//
// This must run and complete *before* anything that reads process.env
// (e.g. @workspace/db, the OpenAI client) is imported — see index.ts,
// which awaits this before dynamically importing ./app.
export function loadLocalEnv(): void {
  // This file is bundled by esbuild into a single artifacts/api-server/dist/index.mjs,
  // so at runtime import.meta.url always resolves to that dist/ location (not
  // this file's original src/lib/ path) — repo root is three levels up from there.
  const envPath = path.resolve(__dirname, "../../../.env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
