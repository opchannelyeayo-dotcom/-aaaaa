import { loadLocalEnv } from "./lib/load-local-env";

// Must happen before ./app (and everything it imports, e.g. @workspace/db,
// the OpenAI client) is evaluated, since those read process.env at module
// load time. Dynamic import() defers evaluation to this point in the
// script, unlike a static import which would be hoisted above this call.
loadLocalEnv();

const { default: app } = await import("./app");
const { logger } = await import("./lib/logger");

// Matches the `localPort` Replit assigns this service in
// artifacts/api-server/.replit-artifact/artifact.toml. On Replit, PORT is
// always injected so this fallback never applies there; locally it lets
// `pnpm dev` work with zero config.
const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
