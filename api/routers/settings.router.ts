import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { createRouter } from "../middleware";
import { anyPermissionProcedure, permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { settings } from "@db/schema";
import { logAudit, requestMeta } from "../services/audit.service";

/**
 * HADRAN FABRICS MALL — settings router.
 * Key-value configuration grouped into STORE / SALES / RECEIPT / HARDWARE /
 * WORKFLOW / AI / SYSTEM. Each group maps to a permission; updates are
 * validated per key and audit-logged with before → after snapshots.
 */

/** Which permission a staff member needs to view/edit a settings group. */
const GROUP_PERMISSIONS: Record<string, string> = {
  STORE: "settings.sales",
  SALES: "settings.sales",
  RECEIPT: "settings.sales",
  HARDWARE: "settings.hardware",
  WORKFLOW: "settings.sales", // approval workflow — Admin-level
  AI: "settings.system", // AI keys — Super Admin only
  SYSTEM: "settings.system",
  STORAGE: "settings.system", // storage / Cloudinary — Super Admin only
};

/** Per-key validation so malformed values never reach the database. */
const str = (max = 255) => z.string().max(max);
const num = (min: number, max: number) => z.number().min(min).max(max);
const bool = z.boolean();

const KEY_SCHEMAS: Record<string, z.ZodTypeAny> = {
  "store.name": str(160).pipe(z.string().min(2, "Store name is required")),
  "store.tagline": str(200),
  "store.motto": str(200),
  "store.address": str(300),
  "store.phone": str(40),
  "store.currency": z.string().length(3, "Currency must be a 3-letter ISO code"),
  "store.currency_symbol": str(8),

  "sales.vat_rate": num(0, 50),
  "sales.service_charge_rate": num(0, 50),
  "sales.max_item_discount_percent": num(0, 100),
  "sales.max_cart_discount_percent": num(0, 100),
  "sales.allow_price_override": bool,
  "sales.receipt_prefix": z.string().min(2).max(6).regex(/^[A-Z]+$/, "Prefix must be uppercase letters"),
  "sales.loyalty_enabled": bool,
  "sales.loyalty_point_per": num(100, 1_000_000),

  "receipt.paper_width_mm": z.union([z.literal(58), z.literal(80)]),
  "receipt.show_logo": bool,
  "receipt.show_cashier": bool,
  "receipt.show_customer": bool,
  "receipt.footer_note": str(300),
  "receipt.return_policy": str(400),

  "hardware.printer_mode": z.enum(["BROWSER", "ESCPOS"]),
  "hardware.printer_name": str(120),
  "hardware.printer_paper_check": bool,
  "hardware.scanner_enabled": bool,
  "hardware.scanner_suffix": z.enum(["ENTER", "TAB"]),
  "hardware.scanner_min_length": num(4, 24),

  "workflow.manager_requires_approval": bool,
  "workflow.gated_actions": z.array(z.string().min(3).max(40)).max(20),
  "workflow.auto_approve_admin": bool,

  "ai.enabled": bool,
  "ai.provider": str(60),
  "ai.base_url": z.string().url("Base URL must be a valid URL").max(300),
  "ai.api_key": str(300),
  "ai.model": str(80),

  "storage.provider": z.enum(["LOCAL", "CLOUDINARY"]),
  "storage.cloud_name": str(80),
  "storage.api_key": str(120),
  "storage.api_secret": str(120),
  "storage.folder": z.string().min(1).max(60).regex(/^[\w\-/]+$/, "Folder may contain letters, numbers, dash, underscore, slash"),

  "system.low_stock_alerts": bool,
  "system.session_hours": num(1, 168),
  "system.audit_retention_days": num(30, 3650),
};

/**
 * Keys introduced after the original seed — list() upserts them so older
 * databases gain the new settings automatically (no manual migration).
 */
const AUTO_SEED: { key: string; group: string; description: string; value: unknown }[] = [
  { key: "storage.provider", group: "STORAGE", description: "Where uploaded files are stored: on this server (LOCAL) or in Cloudinary (CLOUDINARY).", value: "LOCAL" },
  { key: "storage.cloud_name", group: "STORAGE", description: "Cloudinary cloud name (from your Cloudinary dashboard).", value: "" },
  { key: "storage.api_key", group: "STORAGE", description: "Cloudinary API key.", value: "" },
  { key: "storage.api_secret", group: "STORAGE", description: "Cloudinary API secret — stored securely, never shown in full.", value: "" },
  { key: "storage.folder", group: "STORAGE", description: "Cloudinary folder uploads go into (e.g. hadran/products). Use 'hadran' for everything.", value: "hadran" },
];

/** Never echo secrets back in full — mask API keys in list responses. */
const SECRET_KEYS = new Set(["ai.api_key", "storage.api_secret"]);
const mask = (v: string) => (v.length <= 6 ? "••••••" : `${v.slice(0, 3)}••••••${v.slice(-3)}`);

export const settingsRouter = createRouter({
  /** All settings the caller is allowed to see, grouped, with descriptions. */
  list: anyPermissionProcedure(["settings.sales", "settings.hardware", "settings.system"]).query(
    async ({ ctx }) => {
      const db = getDb();
      // Ensure newer settings keys exist (self-healing for older databases).
      for (const seed of AUTO_SEED) {
        const existing = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, seed.key)).limit(1);
        if (existing.length === 0) {
          await db.insert(settings).values({
            key: seed.key,
            group: seed.group,
            value: JSON.stringify(seed.value),
            description: seed.description,
          });
        }
      }
      const rows = await db.select().from(settings).orderBy(asc(settings.key));
      const visible = rows.filter((r) => {
        const perm = GROUP_PERMISSIONS[r.group] ?? "settings.system";
        return ctx.permissions.has(perm);
      });
      return visible.map((r) => {
        let value: unknown;
        try {
          value = JSON.parse(r.value);
        } catch {
          value = r.value;
        }
        const isSecret = SECRET_KEYS.has(r.key);
        return {
          key: r.key,
          group: r.group,
          description: r.description,
          value: isSecret ? "" : value,
          masked: isSecret ? (typeof value === "string" && value.length > 0 ? mask(value) : "") : null,
        };
      });
    },
  ),

  /** Bulk-update settings within one group. Every key is validated. */
  update: anyPermissionProcedure(["settings.sales", "settings.hardware", "settings.system"])
    .input(
      z.object({
        entries: z.array(z.object({ key: z.string().max(100), value: z.unknown() })).min(1).max(50),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const keys = input.entries.map((e) => e.key);
      const existing = await db.select().from(settings).where(inArray(settings.key, keys));
      const byKey = new Map(existing.map((r) => [r.key, r]));

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const updatedKeys: string[] = [];

      for (const entry of input.entries) {
        const row = byKey.get(entry.key);
        if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown setting "${entry.key}".` });

        const perm = GROUP_PERMISSIONS[row.group] ?? "settings.system";
        if (!ctx.permissions.has(perm)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You need the "${perm}" permission to change ${row.group.toLowerCase()} settings.`,
          });
        }

        const schema = KEY_SCHEMAS[entry.key];
        if (!schema) throw new TRPCError({ code: "BAD_REQUEST", message: `Setting "${entry.key}" is read-only.` });
        const parsed = schema.safeParse(entry.value);
        if (!parsed.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${entry.key}: ${parsed.error.issues[0]?.message ?? "invalid value"}`,
          });
        }

        // Empty secret input means "keep the existing key".
        if (SECRET_KEYS.has(entry.key) && parsed.data === "") continue;

        let oldValue: unknown;
        try {
          oldValue = JSON.parse(row.value);
        } catch {
          oldValue = row.value;
        }
        if (JSON.stringify(oldValue) === JSON.stringify(parsed.data)) continue;

        await db
          .update(settings)
          .set({ value: JSON.stringify(parsed.data), updatedBy: ctx.user.id })
          .where(eq(settings.key, entry.key));

        before[entry.key] = SECRET_KEYS.has(entry.key) ? "(hidden)" : oldValue;
        after[entry.key] = SECRET_KEYS.has(entry.key) ? "(updated)" : parsed.data;
        updatedKeys.push(entry.key);
      }

      if (updatedKeys.length > 0) {
        await logAudit({
          actorId: ctx.user.id,
          action: "settings.update",
          entityType: "SETTING",
          entityId: updatedKeys.join(",").slice(0, 40),
          description: `${ctx.user.fullName} updated ${updatedKeys.length} setting(s): ${updatedKeys.join(", ")}.`,
          beforeData: before,
          afterData: after,
          ...requestMeta(ctx.req),
        });
      }
      return { updated: updatedKeys.length, keys: updatedKeys };
    }),

  /** Quick connectivity check for the AI endpoint (uses the saved or supplied config). */
  testAi: permissionProcedure("settings.system")
    .input(z.object({ baseUrl: z.string().url(), apiKey: z.string().optional(), model: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let apiKey = input.apiKey ?? "";
      if (!apiKey) {
        const rows = await db.select().from(settings).where(eq(settings.key, "ai.api_key")).limit(1);
        apiKey = rows[0] ? (JSON.parse(rows[0].value) as string) : "";
      }
      if (!apiKey) return { ok: false, message: "No API key provided — the built-in offline analyst will be used." };

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${input.baseUrl.replace(/\/$/, "")}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return { ok: false, message: `Endpoint responded ${res.status} — check the base URL and API key.` };
        const data = (await res.json()) as { data?: { id: string }[] };
        const models = (data.data ?? []).map((m) => m.id);
        const found = models.length === 0 || models.includes(input.model);
        return {
          ok: true,
          message: found
            ? `Connected — ${models.length} model(s) available${models.length > 0 ? `, "${input.model}" found` : ""}.`
            : `Connected, but model "${input.model}" was not in the list. First models: ${models.slice(0, 3).join(", ")}…`,
        };
      } catch {
        return { ok: false, message: "Could not reach the endpoint (timeout or network error). Check the base URL." };
      }
    }),
});
