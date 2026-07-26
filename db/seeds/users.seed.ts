import bcrypt from "bcryptjs";
import type { getDb } from "../../api/queries/connection";
import { users } from "../schema";

type Db = ReturnType<typeof getDb>;

export interface SeededUsers {
  superAdminId: number;
  adminId: number;
  managerId: number;
  salesId: number;
}

/**
 * Default staff accounts (change passwords after first login!).
 *
 *   superadmin / Super@12345   — SUPER_ADMIN (developer-level)
 *   admin      / Admin@1234    — ADMIN
 *   manager    / Manager@123   — MANAGER
 *   sales1     / Sales@123     — SALES
 */
export async function seedUsers(db: Db): Promise<SeededUsers> {
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    console.log("  • users already seeded — skipped");
    const all = await db.select().from(users);
    const by = (u: string) => all.find((x) => x.username === u)?.id ?? all[0].id;
    return {
      superAdminId: by("superadmin"),
      adminId: by("admin"),
      managerId: by("manager"),
      salesId: by("sales1"),
    };
  }

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const [superAdmin] = await db
    .insert(users)
    .values({
      username: "superadmin",
      passwordHash: hash("Super@12345"),
      fullName: "Super Administrator",
      email: "superadmin@hadranfabrics.ng",
      role: "SUPER_ADMIN",
      staffCode: "HFM-0001",
      notes: "Developer-level account. Full system access including system settings.",
    })
    .$returningId();

  const [admin] = await db
    .insert(users)
    .values({
      username: "admin",
      passwordHash: hash("Admin@1234"),
      fullName: "Store Administrator",
      email: "admin@hadranfabrics.ng",
      role: "ADMIN",
      staffCode: "HFM-0002",
      notes: "Manages staff, permissions, approvals, sales settings and audit review.",
      createdBy: superAdmin.id,
    })
    .$returningId();

  const [manager] = await db
    .insert(users)
    .values({
      username: "manager",
      passwordHash: hash("Manager@123"),
      fullName: "Floor Manager",
      email: "manager@hadranfabrics.ng",
      role: "MANAGER",
      staffCode: "HFM-0003",
      notes: "Runs inventory, stock movements, reports; restricted actions go through admin approval.",
      createdBy: superAdmin.id,
    })
    .$returningId();

  const [sales] = await db
    .insert(users)
    .values({
      username: "sales1",
      passwordHash: hash("Sales@123"),
      fullName: "Sales Associate 1",
      email: "sales1@hadranfabrics.ng",
      role: "SALES",
      staffCode: "HFM-0004",
      notes: "POS sales terminal operator.",
      createdBy: admin.id,
    })
    .$returningId();

  console.log("  • users: 4 default accounts created (superadmin / admin / manager / sales1)");
  return {
    superAdminId: superAdmin.id,
    adminId: admin.id,
    managerId: manager.id,
    salesId: sales.id,
  };
}
