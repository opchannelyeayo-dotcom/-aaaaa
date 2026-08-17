import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind Replit's reverse proxy, req.ip otherwise resolves to the proxy's
// address rather than the client's — needed for the /ocr and /analyze rate
// limiter (see routes/rhetoric) to key on the real caller.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// `credentials: true` + reflected origin (rather than `*`) is required for
// the admin console's session cookie (see lib/admin-auth.ts) to work when
// the admin frontend is served from a different origin than the api-server
// — e.g. local dev, where each artifact runs on its own Vite port. On
// Replit's path-based router both are same-origin already, so this is a
// no-op there.
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);

// 404 for unmatched /api/* routes — keeps error shape consistent JSON, not Express's default HTML page.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Replit Autoscale starts one long-running web process. In production the API
// process also serves both Vite builds, keeping /api, /admin and the public
// site on the same origin just like Replit's development artifact router.
if (process.env.NODE_ENV === "production") {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, "artifacts/rhetoric-xray/dist/public");
  const adminDir = path.join(rootDir, "artifacts/admin-console/dist/public");

  app.use("/admin", express.static(adminDir));
  app.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(adminDir, "index.html"));
  });

  app.use(express.static(publicDir));
  app.get(/^(?!\/api(?:\/|$)|\/admin(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// Centralized error handler. Without this, any thrown/rejected error inside a
// route handler (e.g. the OpenAI call failing, a malformed JSON body, or a
// payload exceeding the 20mb limit) falls through to Express's default error
// handler, which returns an HTML page instead of JSON and can leak stack
// traces. The frontend's fetch client expects a JSON body on error responses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const error = err as { status?: number; statusCode?: number; message?: string; type?: string };
  const status = error.status ?? error.statusCode ?? 500;

  req.log?.error({ err }, "Unhandled request error");

  const message =
    status === 413
      ? "上傳內容過大，請縮小圖片或文字後再試一次"
      : status < 500
        ? (error.message ?? "Bad request")
        : "伺服器發生錯誤，請稍後再試";

  res.status(status).json({ error: message });
});

export default app;
