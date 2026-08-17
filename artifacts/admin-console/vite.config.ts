import fs from 'node:fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// On Replit, PORT / BASE_PATH are injected into process.env automatically,
// so this is a no-op there (no .env file exists in the repo). Running
// locally, nothing injects those vars, so read a `.env` file at the repo
// root (copy `.env.example` to get started) and fill in anything not
// already set. Existing process.env values always win. Mirrors
// artifacts/rhetoric-xray/vite.config.ts.
function loadLocalEnv() {
  const envPath = path.resolve(import.meta.dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
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

loadLocalEnv();

// Match the `localPort` / `BASE_PATH` Replit assigns this service in
// artifacts/admin-console/.replit-artifact/artifact.toml. On Replit these
// are always injected so the fallback never applies there; locally it lets
// `pnpm dev` work with zero config.
const rawPort = process.env.PORT ?? '21906';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/admin/';

// Match the `adminConsoleUrl` logic in
// artifacts/rhetoric-xray/vite.config.ts, mirrored: on Replit a path-based
// router puts the public site at the base path "/" on the same origin;
// running locally there is no such router, so it's a separate port instead.
// Override with MAIN_SITE_URL in .env if it runs on a different local port.
const mainSiteUrl =
  process.env.NODE_ENV === 'production' || process.env.REPL_ID !== undefined
    ? '/'
    : (process.env.MAIN_SITE_URL ?? 'http://localhost:21905/');

export default defineConfig({
  base: basePath,
  define: {
    __MAIN_SITE_URL__: JSON.stringify(mainSiteUrl),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // On Replit, a path-based router in front of both services forwards
    // "/api/*" to the api-server on the same origin (see
    // artifacts/api-server/.replit-artifact/artifact.toml). Running locally
    // there is no such router — this dev-server-only proxy reproduces it.
    // `cookieDomainRewrite`/credentials pass through by default; the
    // api-server's CORS config (origin: true, credentials: true) is what
    // allows the session cookie to actually be set across the two local
    // ports. Override with API_PROXY_TARGET in .env if the api-server runs
    // on a different port locally.
    ...(process.env.REPL_ID === undefined
      ? {
          proxy: {
            '/api': {
              target: process.env.API_PROXY_TARGET ?? 'http://localhost:8080',
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
