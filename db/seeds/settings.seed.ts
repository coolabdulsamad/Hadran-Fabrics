import type { getDb } from "../../api/queries/connection";
import { settings } from "../schema";
import { STORE } from "@contracts/constants";
import type { SeededUsers } from "./users.seed";

type Db = ReturnType<typeof getDb>;

interface SeedSetting {
  key: string;
  value: unknown;
  group: string;
  description: string;
}

/**
 * Store profile (from the official card), sales/tax rates, receipt layout,
 * hardware config, approval-workflow rules and AI integration settings.
 */
const SETTING_ROWS: SeedSetting[] = [
  // ---- STORE PROFILE ----
  { key: "store.name", value: STORE.name, group: "STORE", description: "Business name shown on receipts and headers." },
  { key: "store.tagline", value: STORE.tagline, group: "STORE", description: "Store tagline." },
  { key: "store.motto", value: STORE.motto, group: "STORE", description: "Printed at the bottom of receipts." },
  { key: "store.address", value: STORE.address, group: "STORE", description: "Store address printed on receipts." },
  { key: "store.phone", value: "+234 000 000 0000", group: "STORE", description: "Store contact phone on receipts." },
  { key: "store.currency", value: STORE.currency, group: "STORE", description: "ISO currency code." },
  { key: "store.currency_symbol", value: STORE.currencySymbol, group: "STORE", description: "Currency symbol used across the app." },

  // ---- SALES / TAX / DISCOUNT ----
  { key: "sales.vat_rate", value: STORE.defaultVatRate, group: "SALES", description: "Default VAT percentage applied to sales." },
  { key: "sales.service_charge_rate", value: 0, group: "SALES", description: "Optional service charge percentage on sales." },
  { key: "sales.max_item_discount_percent", value: 20, group: "SALES", description: "Maximum discount a cashier may give per item." },
  { key: "sales.max_cart_discount_percent", value: 30, group: "SALES", description: "Maximum discount allowed on a whole sale." },
  { key: "sales.allow_price_override", value: false, group: "SALES", description: "Allow cashiers to change selling prices at the till." },
  { key: "sales.receipt_prefix", value: "RCP", group: "SALES", description: "Receipt number prefix." },
  { key: "sales.loyalty_enabled", value: true, group: "SALES", description: "Award loyalty points to registered customers." },
  { key: "sales.loyalty_point_per", value: 1000, group: "SALES", description: "1 loyalty point per this amount spent (₦)." },

  // ---- RECEIPT ----
  { key: "receipt.paper_width_mm", value: 80, group: "RECEIPT", description: "Thermal printer paper width (mm)." },
  { key: "receipt.show_logo", value: true, group: "RECEIPT", description: "Print store logo/monogram at the top." },
  { key: "receipt.show_cashier", value: true, group: "RECEIPT", description: "Print the cashier's name on receipts." },
  { key: "receipt.show_customer", value: true, group: "RECEIPT", description: "Print customer name when attached to the sale." },
  { key: "receipt.footer_note", value: "Thank you for shopping with us — Luxury in every visit.", group: "RECEIPT", description: "Receipt footer message." },
  { key: "receipt.return_policy", value: "Items may be returned or exchanged within 7 days with receipt, in original condition.", group: "RECEIPT", description: "Return policy printed on receipts." },

  // ---- HARDWARE ----
  { key: "hardware.printer_mode", value: "BROWSER", group: "HARDWARE", description: "BROWSER (window.print to thermal driver) or ESCPOS (raw commands)." },
  { key: "hardware.printer_name", value: "", group: "HARDWARE", description: "Preferred printer device name (optional)." },
  { key: "hardware.printer_paper_check", value: true, group: "HARDWARE", description: "Prompt the cashier when the printer reports no paper/offline." },
  { key: "hardware.scanner_enabled", value: true, group: "HARDWARE", description: "Listen for USB barcode scanner input (keyboard-wedge mode)." },
  { key: "hardware.scanner_suffix", value: "ENTER", group: "HARDWARE", description: "Scanner terminator key (ENTER or TAB)." },
  { key: "hardware.scanner_min_length", value: 6, group: "HARDWARE", description: "Minimum barcode length accepted from the scanner." },

  // ---- APPROVAL WORKFLOW ----
  { key: "workflow.manager_requires_approval", value: true, group: "WORKFLOW", description: "Manager product/stock/void actions require Admin or Super Admin approval." },
  { key: "workflow.gated_actions", value: ["PRODUCT_CREATE", "PRODUCT_EDIT", "PRODUCT_DELETE", "STOCK_ADJUSTMENT", "VOID_SALE", "RETURN_PROCESS", "CUSTOMER_DISCOUNT"], group: "WORKFLOW", description: "Action types that go through the approval workflow." },
  { key: "workflow.auto_approve_admin", value: true, group: "WORKFLOW", description: "Admin/Super Admin actions skip the approval queue." },

  // ---- AI ASSISTANT ----
  { key: "ai.enabled", value: true, group: "AI", description: "Enable the AI assistant for Manager and above." },
  { key: "ai.provider", value: "openai-compatible", group: "AI", description: "AI provider type (OpenAI-compatible API)." },
  { key: "ai.base_url", value: "https://api.openai.com/v1", group: "AI", description: "API base URL (works with OpenAI, OpenRouter, Ollama…)." },
  { key: "ai.api_key", value: "", group: "AI", description: "API key — set in System Settings before using AI." },
  { key: "ai.model", value: "gpt-4o-mini", group: "AI", description: "Model used for data Q&A and report generation." },

  // ---- SYSTEM ----
  { key: "system.low_stock_alerts", value: true, group: "SYSTEM", description: "Notify managers when products hit reorder level." },
  { key: "system.session_hours", value: 12, group: "SYSTEM", description: "Login session lifetime in hours." },
  { key: "system.audit_retention_days", value: 365, group: "SYSTEM", description: "How long audit logs are kept." },
];

export async function seedSettings(db: Db, ids: SeededUsers) {
  const existing = await db.select().from(settings).limit(1);
  if (existing.length > 0) {
    console.log("  • settings already seeded — skipped");
    return;
  }

  await db.insert(settings).values(
    SETTING_ROWS.map((s) => ({
      key: s.key,
      value: JSON.stringify(s.value),
      group: s.group,
      description: s.description,
      updatedBy: ids.superAdminId,
    })),
  );

  console.log(`  • settings: ${SETTING_ROWS.length} keys across STORE/SALES/RECEIPT/HARDWARE/WORKFLOW/AI/SYSTEM`);
}
