import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, adminUsersTable, ADMIN_ROLES, type AdminUser, type AdminRole } from "@workspace/db";
import { requireAdminAuth, requireRole, hashPassword } from "../../lib/admin-auth";

const router: IRouter = Router();

// Account management is super_admin only — this is the RBAC control surface
// itself, not just risk-tag content, so no reviewer/viewer access at all.
router.use("/admin/users", requireAdminAuth, requireRole("super_admin"));

const MAX_USERNAME_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

function toJson(u: AdminUser) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(adminUsersTable).orderBy(adminUsersTable.username);
  res.json({ users: users.map(toJson) });
});

router.post("/admin/users", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (typeof body.username !== "string" || !body.username.trim()) {
    res.status(400).json({ error: "帳號不可為空" });
    return;
  }
  if (body.username.length > MAX_USERNAME_LENGTH) {
    res.status(400).json({ error: "帳號過長" });
    return;
  }
  if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `密碼至少需 ${MIN_PASSWORD_LENGTH} 碼` });
    return;
  }
  if (typeof body.role !== "string" || !(ADMIN_ROLES as string[]).includes(body.role)) {
    res.status(400).json({ error: "角色需為 super_admin / reviewer / viewer" });
    return;
  }
  if (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== "string") {
    res.status(400).json({ error: "顯示名稱格式錯誤" });
    return;
  }
  if (typeof body.displayName === "string" && body.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    res.status(400).json({ error: "顯示名稱過長" });
    return;
  }

  const [existing] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.username, body.username.trim()));
  if (existing) {
    res.status(409).json({ error: "帳號已存在" });
    return;
  }

  const passwordHash = await hashPassword(body.password);
  const [created] = await db
    .insert(adminUsersTable)
    .values({
      username: body.username.trim(),
      passwordHash,
      role: body.role as AdminRole,
      displayName: (body.displayName as string | undefined)?.trim() || null,
      active: true,
    })
    .returning();

  res.status(201).json(toJson(created));
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [existing] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<typeof adminUsersTable.$inferInsert> = {};

  if ("role" in body) {
    if (typeof body.role !== "string" || !(ADMIN_ROLES as string[]).includes(body.role)) {
      res.status(400).json({ error: "角色需為 super_admin / reviewer / viewer" });
      return;
    }
    // Prevent an admin locking themselves out by demoting the only
    // super_admin account — cheap check, not airtight under concurrent
    // requests, but airtight isn't needed for a handful of internal accounts.
    if (existing.role === "super_admin" && body.role !== "super_admin") {
      const superAdmins = await db
        .select()
        .from(adminUsersTable)
        .where(eq(adminUsersTable.role, "super_admin"));
      if (superAdmins.length <= 1) {
        res.status(400).json({ error: "無法移除最後一位超級管理員的權限" });
        return;
      }
    }
    updates.role = body.role as AdminRole;
  }

  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      res.status(400).json({ error: "active 需為布林值" });
      return;
    }
    updates.active = body.active;
  }

  if ("displayName" in body) {
    if (body.displayName !== null && typeof body.displayName !== "string") {
      res.status(400).json({ error: "顯示名稱格式錯誤" });
      return;
    }
    updates.displayName = body.displayName === null ? null : body.displayName.trim() || null;
  }

  if ("password" in body) {
    if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `密碼至少需 ${MIN_PASSWORD_LENGTH} 碼` });
      return;
    }
    updates.passwordHash = await hashPassword(body.password);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "沒有提供任何要更新的欄位" });
    return;
  }

  const [updated] = await db
    .update(adminUsersTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(adminUsersTable.id, id))
    .returning();

  res.json(toJson(updated));
});

router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [existing] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (existing.role === "super_admin") {
    const superAdmins = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.role, "super_admin"));
    if (superAdmins.length <= 1) {
      res.status(400).json({ error: "無法刪除最後一位超級管理員" });
      return;
    }
  }

  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  res.json({ ok: true, id });
});

export default router;
