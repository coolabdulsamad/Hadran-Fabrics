import type { getDb } from "../../api/queries/connection";
import { categories } from "../schema";
import { eq } from "drizzle-orm";

type Db = ReturnType<typeof getDb>;

/** Category name → id map, used by the product seed. */
export type CategoryMap = Record<string, number>;

/**
 * Category tree matching the mall's shelves (see store photos):
 * Fabrics → Ankara / Men Lace / Women Lace / Wool / Guinea / Cashmere / Silk / Atiku
 * plus Ready-Made Native Wear, Shoes, Jewelry, Bags, Hats & Caps, Head Ties.
 */
export async function seedCategories(db: Db): Promise<CategoryMap> {
  const existing = await db.select().from(categories).limit(1);
  if (existing.length > 0) {
    console.log("  • categories already seeded — skipped");
    const all = await db.select().from(categories);
    return Object.fromEntries(all.map((c) => [c.name, c.id]));
  }

  // Parents first
  const parents = [
    { name: "Fabrics", description: "All clothing materials sold by the yard or full pack.", sortOrder: 1 },
    { name: "Ready-Made Native Wear", description: "Sewn agbada, kaftans, senator suits and native dresses.", sortOrder: 2 },
    { name: "Shoes", description: "Heels, sandals, slippers and formal shoes.", sortOrder: 3 },
    { name: "Jewelry", description: "Necklaces, earrings, bracelets and full jewelry sets.", sortOrder: 4 },
    { name: "Bags & Clutches", description: "Handbags, clutches and purses.", sortOrder: 5 },
    { name: "Hats & Caps", description: "Fila, abeti-aja and traditional caps.", sortOrder: 6 },
    { name: "Head Ties & Gele", description: "Gele, head ties and auto-gele.", sortOrder: 7 },
    { name: "Accessories", description: "Belts, cufflinks, brooches and other accessories.", sortOrder: 8 },
  ];

  const parentIds: CategoryMap = {};
  for (const p of parents) {
    const [row] = await db.insert(categories).values(p).$returningId();
    parentIds[p.name] = row.id;
  }

  // Fabric sub-categories
  const fabricChildren = [
    { name: "Ankara (Wax Print)", sortOrder: 1, description: "African wax print fabrics — sold per yard or 6-yard pack." },
    { name: "Men Lace", sortOrder: 2, description: "Swiss voile and polish lace for men." },
    { name: "Women Lace", sortOrder: 3, description: "French lace, cord lace and sequined lace." },
    { name: "Wool & Senator", sortOrder: 4, description: "Senator material and suiting wool." },
    { name: "Guinea Brocade", sortOrder: 5, description: "Brocade for agbada and boubou." },
    { name: "Cashmere", sortOrder: 6, description: "Premium Italian cashmere." },
    { name: "Silk & Chiffon", sortOrder: 7, description: "Silk and chiffon fabrics." },
    { name: "Atiku & Cotton", sortOrder: 8, description: "Atiku and cotton materials." },
  ];

  const map: CategoryMap = { ...parentIds };
  for (const c of fabricChildren) {
    const [row] = await db
      .insert(categories)
      .values({ ...c, parentId: parentIds["Fabrics"] })
      .$returningId();
    map[c.name] = row.id;
  }

  console.log(`  • categories: ${parents.length} parents + ${fabricChildren.length} fabric sub-categories`);
  return map;
}

/** Helper: look up a category id by name (throws if missing). */
export async function categoryIdByName(db: Db, name: string): Promise<number> {
  const row = await db.select().from(categories).where(eq(categories.name, name)).limit(1);
  if (!row[0]) throw new Error(`Category not found: ${name}`);
  return row[0].id;
}
