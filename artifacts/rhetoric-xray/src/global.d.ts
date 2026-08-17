// Injected at build time via vite.config.ts `define` — resolves to the
// admin console's URL, which differs between a bare-metal local checkout
// (separate port) and Replit dev/production (same-origin path router).
declare const __ADMIN_CONSOLE_URL__: string;
