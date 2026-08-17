import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Named admin accounts with roles, additive to the existing single fixed
// ADMIN_USERNAME/ADMIN_PASSWORD login (see lib/admin-auth.ts). That env-var
// account keeps working and is treated as super_admin — this table is only
// for the risk-tag database's three-tier review workflow (超級管理員／內容
// 審核員／只讀使用者), which the single shared account can't express.
// ---------------------------------------------------------------------------

export type AdminRole = "super_admin" | "reviewer" | "viewer";
export const ADMIN_ROLES: AdminRole[] = ["super_admin", "reviewer", "viewer"];

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  // scrypt "salt:hash" hex pair — no new dependency (bcrypt/argon2), same
  // reasoning as admin-auth.ts's choice to hand-roll session signing instead
  // of pulling in jsonwebtoken/express-session.
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer").$type<AdminRole>(),
  displayName: text("display_name"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsersTable.$inferSelect;
