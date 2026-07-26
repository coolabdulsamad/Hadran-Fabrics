import type { getDb } from "../../api/queries/connection";
import { products, stockMovements, suppliers } from "../schema";
import type { CategoryMap } from "./categories.seed";
import type { SeededUsers } from "./users.seed";
import type { UNITS, PRODUCT_TYPES, MATERIAL_TYPES } from "@contracts/constants";

type Db = ReturnType<typeof getDb>;
type Unit = (typeof UNITS)[number];
type PType = (typeof PRODUCT_TYPES)[number];
type MType = (typeof MATERIAL_TYPES)[number] | null;

interface SeedProduct {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  productType: PType;
  materialType?: MType;
  color?: string;
  pattern?: string;
  brand?: string;
  unit: Unit;
  packSize?: number;
  allowFractional?: boolean;
  cost: number;
  price: number;
  wholesale?: number;
  stock: number;
  reorder: number;
  shelf?: string;
}

/**
 * Realistic opening catalog for Hadran Fabrics Mall — fabrics by the yard
 * (cut from full packs), ready-made native wear, shoes, jewelry, bags, caps.
 */
const CATALOG: SeedProduct[] = [
  {
    sku: "ANK-0001", barcode: "6123450000011", name: "Premium Ankara Wax Print — Royal Blue & Gold",
    description: "High-grade African wax print, vibrant royal blue with gold motifs. Sold per yard; full 6-yard pack available.",
    category: "Ankara (Wax Print)", productType: "FABRIC", materialType: "ANKARA", color: "Royal Blue & Gold",
    pattern: "Geometric wax print", brand: "Vlisco-style", unit: "YARD", packSize: 6, allowFractional: true,
    cost: 2800, price: 4500, wholesale: 3800, stock: 48, reorder: 12, shelf: "Ankara Wall A1",
  },
  {
    sku: "ANK-0002", barcode: "6123450000028", name: "Ankara Hollandis — Red Sunrise",
    description: "Hollandis wax print, rich red/orange sunrise pattern. 6 yards per pack, measured cuts allowed.",
    category: "Ankara (Wax Print)", productType: "FABRIC", materialType: "ANKARA", color: "Red / Orange",
    pattern: "Sunrise floral", unit: "YARD", packSize: 6, allowFractional: true,
    cost: 4200, price: 6500, wholesale: 5600, stock: 36, reorder: 12, shelf: "Ankara Wall A2",
  },
  {
    sku: "MLC-0001", barcode: "6123450000035", name: "Swiss Voile Men Lace — Pure White",
    description: "Premium Swiss voile polish lace for men. 5 yards per pack. Soft, breathable, luxury finish.",
    category: "Men Lace", productType: "FABRIC", materialType: "MEN_LACE", color: "Pure White",
    brand: "Swiss Voile", unit: "YARD", packSize: 5, allowFractional: true,
    cost: 5800, price: 8500, wholesale: 7600, stock: 25, reorder: 10, shelf: "Men Lace Wall",
  },
  {
    sku: "WLC-0001", barcode: "6123450000042", name: "French Cord Lace — Champagne Gold",
    description: "Elegant French cord lace with sequin detailing. Perfect for owambe. Sold per yard.",
    category: "Women Lace", productType: "FABRIC", materialType: "WOMEN_LACE", color: "Champagne Gold",
    pattern: "Cord lace + sequins", unit: "YARD", packSize: 5, allowFractional: true,
    cost: 8400, price: 12000, wholesale: 10500, stock: 20, reorder: 8, shelf: "Women Lace Wall",
  },
  {
    sku: "WOL-0001", barcode: "6123450000059", name: "Senator Wool — Charcoal Grey",
    description: "Quality senator material for suits and native wear. Smooth texture, wrinkle resistant.",
    category: "Wool & Senator", productType: "FABRIC", materialType: "WOOL", color: "Charcoal Grey",
    unit: "YARD", packSize: 4, allowFractional: true,
    cost: 3500, price: 5500, wholesale: 4700, stock: 40, reorder: 12, shelf: "Wool Wall",
  },
  {
    sku: "GUI-0001", barcode: "6123450000066", name: "Guinea Brocade — Wine",
    description: "Rich guinea brocade for agbada and boubou. Deep wine colour with subtle shine.",
    category: "Guinea Brocade", productType: "FABRIC", materialType: "GUINEA_BROCADE", color: "Wine",
    unit: "YARD", packSize: 5, allowFractional: true,
    cost: 4100, price: 6000, wholesale: 5200, stock: 30, reorder: 10, shelf: "Guinea Section",
  },
  {
    sku: "CAS-0001", barcode: "6123450000073", name: "Italian Cashmere — Midnight Navy",
    description: "Top-grade Italian cashmere. Smooth luxury finish for premium kaftans and suits.",
    category: "Cashmere", productType: "FABRIC", materialType: "CASHMERE", color: "Midnight Navy",
    unit: "YARD", packSize: 4, allowFractional: true,
    cost: 6800, price: 9500, wholesale: 8300, stock: 15, reorder: 6, shelf: "Cashmere Shelf",
  },
  {
    sku: "RMW-0001", barcode: "6123450000080", name: "Ready-Made Agbada Set — Royal White (3pc)",
    description: "Complete 3-piece agbada set: agbada, buba and sokoto with embroidery. Ready to wear.",
    category: "Ready-Made Native Wear", productType: "READY_WEAR", color: "Royal White",
    unit: "SET", allowFractional: false,
    cost: 24000, price: 35000, stock: 8, reorder: 3, shelf: "Native Wear Rack",
  },
  {
    sku: "RMW-0002", barcode: "6123450000097", name: "Men Kaftan — Sky Blue",
    description: "Classic men's kaftan, tailored fit with chest embroidery.",
    category: "Ready-Made Native Wear", productType: "READY_WEAR", color: "Sky Blue",
    unit: "PIECE", allowFractional: false,
    cost: 12000, price: 18500, stock: 12, reorder: 4, shelf: "Native Wear Rack",
  },
  {
    sku: "SHO-0001", barcode: "6123450000103", name: "Stiletto Heels — Gold Shimmer",
    description: "Elegant gold shimmer stiletto heels. Sizes 37–42 available.",
    category: "Shoes", productType: "SHOES", color: "Gold", brand: "Hadran Select",
    unit: "PAIR", allowFractional: false,
    cost: 14000, price: 22000, stock: 10, reorder: 3, shelf: "Shoe Display 1",
  },
  {
    sku: "BAG-0001", barcode: "6123450000110", name: "Luxury Crystal Clutch — Silver",
    description: "Crystal-studded evening clutch with chain strap. Statement piece.",
    category: "Bags & Clutches", productType: "BAGS", color: "Silver",
    unit: "PIECE", allowFractional: false,
    cost: 17000, price: 27000, stock: 6, reorder: 2, shelf: "Clutch Stand",
  },
  {
    sku: "JWL-0001", barcode: "6123450000127", name: "Gold-Plated Jewelry Set (Necklace + Earrings + Bracelet)",
    description: "3-piece gold-plated jewelry set. Tarnish resistant, gift box included.",
    category: "Jewelry", productType: "JEWELRY", color: "Gold",
    unit: "SET", allowFractional: false,
    cost: 8500, price: 15000, stock: 9, reorder: 3, shelf: "Jewelry Glass Case",
  },
  {
    sku: "HAT-0001", barcode: "6123450000134", name: "Fila Cap (Native) — Aso-Oke Pattern",
    description: "Traditional fila cap woven from aso-oke. One size, adjustable inner band.",
    category: "Hats & Caps", productType: "HATS", color: "Multi (Aso-Oke)",
    unit: "PIECE", allowFractional: false,
    cost: 4500, price: 8000, stock: 14, reorder: 4, shelf: "Cap Shelf",
  },
  {
    sku: "GEL-0001", barcode: "6123450000141", name: "Silk Head Tie (Gele) — Emerald Green",
    description: "Premium silk gele, rich emerald green with soft sheen.",
    category: "Head Ties & Gele", productType: "FABRIC", materialType: "GELE", color: "Emerald Green",
    unit: "PIECE", allowFractional: false,
    cost: 4200, price: 7500, stock: 18, reorder: 5, shelf: "Gele Wall",
  },
];

export async function seedProducts(db: Db, catMap: CategoryMap, ids: SeededUsers) {
  const existing = await db.select().from(products).limit(1);
  if (existing.length > 0) {
    console.log("  • products already seeded — skipped");
    return;
  }

  // One default supplier for the opening stock
  const [sup] = await db
    .insert(suppliers)
    .values({
      name: "Hadran Wholesale Partners",
      contactPerson: "Purchasing Desk",
      phone: "+234 800 000 0000",
      address: "New Market, Kubwa — Abuja",
      notes: "Default supplier for opening stock. Replace with real supplier records.",
    })
    .$returningId();

  for (const p of CATALOG) {
    const categoryId = catMap[p.category];
    if (!categoryId) throw new Error(`Unknown category in product seed: ${p.category}`);

    const [row] = await db
      .insert(products)
      .values({
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        description: p.description,
        categoryId,
        supplierId: sup.id,
        productType: p.productType,
        materialType: p.materialType ?? null,
        color: p.color ?? null,
        pattern: p.pattern ?? null,
        brand: p.brand ?? null,
        unitOfMeasure: p.unit,
        packSize: p.packSize ?? null,
        allowFractional: p.allowFractional ?? false,
        costPrice: p.cost,
        sellingPrice: p.price,
        wholesalePrice: p.wholesale ?? null,
        currentStock: p.stock,
        reorderLevel: p.reorder,
        shelfLocation: p.shelf ?? null,
        status: "ACTIVE",
        createdBy: ids.adminId,
      })
      .$returningId();

    // Opening stock → immutable movement ledger entry
    await db.insert(stockMovements).values({
      productId: row.id,
      movementType: "STOCK_IN",
      quantity: p.stock,
      unit: p.unit,
      balanceAfter: p.stock,
      referenceType: "SEED",
      reason: "Opening stock",
      notes: "Initial inventory recorded during system setup.",
      performedBy: ids.managerId,
    });
  }

  console.log(`  • suppliers: 1 default • products: ${CATALOG.length} with opening stock movements`);
}
