import { getDb } from "../api/queries/connection";
import { auditLogs } from "./schema";
import { seedRolePermissions } from "./seeds/roles.seed";
import { seedUsers } from "./seeds/users.seed";
import { seedCategories } from "./seeds/categories.seed";
import { seedProducts } from "./seeds/products.seed";
import { seedSettings } from "./seeds/settings.seed";

/**
 * HADRAN FABRICS MALL — database seeder
 * Run:  npx tsx db/seed.ts   (after `npm run db:push`)
 * Safe to re-run — every seed skips data that already exists.
 */
async function seed() {
  const db = getDb();
  console.log("Seeding Hadran Fabrics Mall database...");

  const ids = await seedUsers(db);
  await seedRolePermissions(db);
  const catMap = await seedCategories(db);
  await seedProducts(db, catMap, ids);
  await seedSettings(db, ids);

  // First audit trail entry — the audit log starts recording from birth.
  const seeded = await db.select().from(auditLogs).limit(1);
  if (seeded.length === 0) {
    await db.insert(auditLogs).values({
      actorId: ids.superAdminId,
      actorName: "System",
      actorRole: "SUPER_ADMIN",
      action: "system.seed",
      entityType: "SYSTEM",
      entityId: null,
      description: "Database initialized: roles, permissions, users, categories, products, opening stock and settings.",
      beforeData: null,
      afterData: null,
    });
    console.log("  • audit_logs: initialization entry recorded");
  }

  console.log("Done. Login accounts:");
  console.log("  superadmin / Super@12345  (SUPER_ADMIN)");
  console.log("  admin      / Admin@1234   (ADMIN)");
  console.log("  manager    / Manager@123  (MANAGER)");
  console.log("  sales1     / Sales@123    (SALES)");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
