import type { getDb } from "../../api/queries/connection";
import { rolePermissions } from "../schema";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS } from "@contracts/permissions";
import { USER_ROLES } from "@contracts/roles";

type Db = ReturnType<typeof getDb>;

/**
 * Seeds the default permission matrix: role → allowed permission keys.
 * Admins can later tune this in Permission Management.
 */
export async function seedRolePermissions(db: Db) {
  const existing = await db.select().from(rolePermissions).limit(1);
  if (existing.length > 0) {
    console.log("  • role_permissions already seeded — skipped");
    return;
  }

  const rows: { role: (typeof USER_ROLES)[number]; permissionKey: string; allowed: boolean }[] = [];
  for (const role of USER_ROLES) {
    const allowed = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
    for (const key of PERMISSION_KEYS) {
      rows.push({ role, permissionKey: key, allowed: allowed.has(key) });
    }
  }

  await db.insert(rolePermissions).values(rows);
  console.log(`  • role_permissions: ${rows.length} rows (4 roles × ${PERMISSION_KEYS.length} permissions)`);
}
