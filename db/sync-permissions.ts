import { getDb } from "../api/queries/connection";
import { seedRolePermissions } from "./seeds/roles.seed";

/**
 * HADRAN FABRICS MALL — permission matrix sync (ops utility)
 * Run:  npx tsx db/sync-permissions.ts
 *
 * Inserts any missing (role, permission key) rows into role_permissions
 * using the preset defaults, without touching existing rows. Safe to run
 * against any environment; production also runs this automatically at boot.
 */
async function main() {
  const db = getDb();
  console.log("Syncing role permission matrix...");
  await seedRolePermissions(db);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Permission sync failed:", err);
  process.exit(1);
});
