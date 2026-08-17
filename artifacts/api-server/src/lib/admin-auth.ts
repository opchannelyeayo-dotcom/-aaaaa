import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, adminUsersTable, type AdminRole } from "@workspace/db";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Cookie-session auth for the admin console. No new dependency
// (jsonwebtoken, express-session, etc.) — a signed, expiring token is enough.
//
// Two account sources feed into the same session mechanism:
// 1. The original single fixed ADMIN_USERNAME/ADMIN_PASSWORD env-var account
//    — always treated as "super_admin". Kept as-is so existing deployments
//    don't lose access on upgrade.
// 2. Named accounts in admin_users (see @workspace/db risk-tags/admin-users
//    schema), each with its own role — added for the risk-tag database's
//    three-tier review workflow (超級管理員／內容審核員／只讀使用者), which
//    a single shared account can't express.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ADMIN_SESSION_SECRET should be set explicitly (see .env.example) so
// sessions survive a server restart/redeploy. If it's missing we still
// generate a random one at boot rather than hard-failing the whole
// api-server (the public rhetoric-analysis site must keep working even if
// the admin console isn't configured yet) — logged-in admins will just get
// signed out the next time the process restarts.
const sessionSecret =
  process.env.ADMIN_SESSION_SECRET ??
  (() => {
    logger.warn(
      "ADMIN_SESSION_SECRET is not set — using a random secret for this " +
        "process. Admin sessions will not survive a restart/redeploy. Set " +
        "ADMIN_SESSION_SECRET to a fixed value (see .env.example) to avoid this.",
    );
    return crypto.randomBytes(32).toString("hex");
  })();

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret).update(payload).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Builds a signed `expiresAt.role.signature` token for the given username. */
function createSessionToken(username: string, role: AdminRole): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${username}.${role}.${expiresAt}`;
  return `${expiresAt}.${role}.${sign(payload)}`;
}

function verifySessionToken(
  username: string,
  token: string | undefined,
): { valid: boolean; role: AdminRole | null } {
  if (!token) return { valid: false, role: null };

  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, role: null };
  const [expiresAtRaw, role, signature] = parts;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { valid: false, role: null };
  if (!isAdminRole(role)) return { valid: false, role: null };

  const expectedSignature = sign(`${username}.${role}.${expiresAtRaw}`);
  if (!timingSafeEqual(signature, expectedSignature)) return { valid: false, role: null };

  return { valid: true, role };
}

function isAdminRole(value: string): value is AdminRole {
  return value === "super_admin" || value === "reviewer" || value === "viewer";
}

function credentialsAreConfigured(): boolean {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

/** Validates a login attempt against ADMIN_USERNAME / ADMIN_PASSWORD (legacy fixed account). */
export function checkCredentials(username: string, password: string): boolean {
  if (!credentialsAreConfigured()) return false;

  const expectedUsername = process.env.ADMIN_USERNAME as string;
  const expectedPassword = process.env.ADMIN_PASSWORD as string;

  // Pad both sides so timingSafeEqual never throws on length mismatch,
  // which would otherwise leak whether the username was correct via timing.
  return (
    timingSafeEqual(username, expectedUsername) &&
    timingSafeEqual(password, expectedPassword)
  );
}

// ---------------------------------------------------------------------------
// Password hashing for named admin_users accounts — scrypt with a random
// salt, stored as "salt:hash" (both hex). No bcrypt/argon2 dependency, same
// reasoning as the rest of this file: node:crypto is already sufficient.
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      const expected = Buffer.from(hashHex, "hex");
      // scrypt always returns SCRYPT_KEYLEN bytes, but a corrupted/legacy
      // stored hash could be a different length — guard before
      // timingSafeEqual, which throws (not returns false) on length mismatch.
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

export interface AdminIdentity {
  username: string;
  role: AdminRole;
}

/**
 * Authenticates against the legacy fixed account first, then named
 * admin_users accounts. Returns the resolved role on success.
 */
export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<AdminIdentity | null> {
  if (checkCredentials(username, password)) {
    return { username, role: "super_admin" };
  }

  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username));
  if (!user || !user.active) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return { username: user.username, role: user.role };
}

export function issueSessionCookie(res: Response, username: string, role: AdminRole): void {
  const token = createSessionToken(username, role);
  res.cookie(COOKIE_NAME, `${username}:${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/api/admin",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/api/admin" });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminIdentity;
    }
  }
}

/** Express middleware: 401s any request without a valid admin session cookie. Attaches req.adminUser. */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const raw = (req.cookies?.[COOKIE_NAME] as string | undefined) ?? undefined;
  const colonIndex = raw?.indexOf(":") ?? -1;

  if (!raw || colonIndex === -1) {
    res.status(401).json({ error: "請先登入" });
    return;
  }

  const username = raw.slice(0, colonIndex);
  const token = raw.slice(colonIndex + 1);

  const { valid, role } = verifySessionToken(username, token);
  if (!valid || !role) {
    res.status(401).json({ error: "登入已過期，請重新登入" });
    return;
  }

  req.adminUser = { username, role };
  next();
}

/**
 * Express middleware factory: 403s any request whose session role isn't one
 * of `allowed`. super_admin always passes regardless of `allowed`. Must run
 * after requireAdminAuth (relies on req.adminUser being set).
 */
export function requireRole(...allowed: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.adminUser?.role;
    if (!role) {
      res.status(401).json({ error: "請先登入" });
      return;
    }
    if (role === "super_admin" || allowed.includes(role)) {
      next();
      return;
    }
    res.status(403).json({ error: "沒有權限執行此操作" });
  };
}
