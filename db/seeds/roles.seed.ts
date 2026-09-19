import type { getDb } from "../../api/queries/connection";
import { rolePermissions } from "../schema";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } from "@contracts/permissions";
import { USER_ROLES } from "@contracts/roles";

type Db = ReturnType<typeof getDb>;

/**
 * Syncs the default permission matrix: role → allowed permission keys.
 *
 * Idempotent and self-healing: only (role, permission) pairs that are
 * completely missing from the table are inserted (with the preset default).
 * Rows that already exist are NEVER touched, so any tuning an Admin has
 * done in Permission Management is preserved — while permissions added in
 * newer releases reach existing databases automatically on the next run.
 *
 * Admins can later tune this in Permission Management.
 */
export async function seedRolePermissions(db: Db) {
  const existing = await db.select().from(rolePermissions);
  const have = new Set(existing.map((r) => `${r.role}|${r.permissionKey}`));

  const rows: { role: (typeof USER_ROLES)[number]; permissionKey: string; allowed: boolean }[] = [];
  for (const role of USER_ROLES) {
    const allowed = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
    for (const key of PERMISSION_KEYS) {
      if (have.has(`${role}|${key}`)) continue;
      rows.push({ role, permissionKey: key, allowed: allowed.has(key) });
    }
  }

  if (rows.length === 0) {
    console.log("  • role_permissions already in sync — skipped");
    return;
  }

  await db.insert(rolePermissions).values(rows);
  console.log(
    existing.length === 0
      ? `  • role_permissions: ${rows.length} rows (${USER_ROLES.length} roles × ${PERMISSION_KEYS.length} permissions)`
      : `  • role_permissions: synced ${rows.length} missing row(s) for new permission keys`,
  );
}
