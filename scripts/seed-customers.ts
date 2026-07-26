/**
 * One-off: seed two demo customers for POS attach testing.
 * Run with: npx tsx scripts/seed-customers.ts
 */
import { getDb } from "../api/queries/connection";
import { customers } from "../db/schema";
import { like } from "drizzle-orm";

async function main() {
  const db = getDb();
  const existing = await db.select().from(customers).where(like(customers.code, "CUS-%"));
  if (existing.length > 0) {
    console.log(`Customers already exist (${existing.length}) — skipping.`);
    process.exit(0);
  }
  await db.insert(customers).values([
    {
      code: "CUS-0001",
      fullName: "Alhaji Musa Bello",
      phone: "0803 111 2233",
      email: "musabello@example.com",
      discountPercent: 5,
      notes: "Regular bulk fabric buyer — aso-ebi orders.",
    },
    {
      code: "CUS-0002",
      fullName: "Mrs. Adaeze Okafor",
      phone: "0805 444 7788",
      email: "adaeze.okafor@example.com",
      discountPercent: 10,
      notes: "VIP — boutique owner, monthly lace & brocade purchases.",
    },
  ]);
  console.log("Seeded 2 demo customers (CUS-0001, CUS-0002).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
