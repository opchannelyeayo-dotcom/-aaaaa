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
// already set. Existing process.env values always win.
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
// artifacts/rhetoric-xray/.replit-artifact/artifact.toml. On Replit these
// are always injected so the fallback never applies there; locally it lets
// `pnpm dev` work with zero config.
const rawPort = process.env.PORT ?? '21905';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

// On Replit (dev workflow or production), a path-based router in front of
// both services makes the admin console reachable at "/admin/" on the same
// origin (see artifacts/admin-console/.replit-artifact/artifact.toml).
// Running truly standalone locally there is no such router, so the admin
// console is a separate port instead — same REPL_ID check the /api proxy
// above uses. Override with ADMIN_CONSOLE_URL in .env if it runs on a
// different local port.
const adminConsoleUrl =
  process.env.NODE_ENV === 'production' || process.env.REPL_ID !== undefined
    ? '/admin/'
    : (process.env.ADMIN_CONSOLE_URL ?? 'http://localhost:21906/admin/');

export default defineConfig({
  base: basePath,
  define: {
    __ADMIN_CONSOLE_URL__: JSON.stringify(adminConsoleUrl),
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
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
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
    // artifacts/api-server/.replit-artifact/artifact.toml). Running
    // locally there is no such router — this dev-server-only proxy
    // reproduces it by forwarding to the api-server's local port (see
    // artifacts/api-server/.replit-artifact/artifact.toml -> localPort).
    // Override with API_PROXY_TARGET in .env if the api-server runs on a
    // different port locally.
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
