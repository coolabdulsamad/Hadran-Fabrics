import { sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { settings } from "@db/schema";
import * as tools from "./ai-tools";

/**
 * HADRAN FABRICS MALL — AI assistant service.
 * Two modes:
 *   1. CLOUD — an OpenAI-compatible endpoint (configured in Settings →
 *      AI Assistant) with function calling over live DB tools.
 *   2. OFFLINE ANALYST — no key configured: a rule-based analyst that
 *      routes the question to the same DB tools and composes a
 *      markdown answer. Honest, fast, always available.
 */

interface AiConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

async function loadConfig(): Promise<AiConfig> {
  const db = getDb();
  const rows = await db
    .select()
    .from(settings)
    .where(sql`${settings.key} IN ('ai.enabled','ai.api_key','ai.base_url','ai.model')`);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const read = (k: string, fallback: string) => {
    const v = map.get(k);
    if (v == null) return fallback;
    try {
      return String(JSON.parse(v));
    } catch {
      return String(v);
    }
  };
  return {
    enabled: read("ai.enabled", "true") !== "false",
    apiKey: read("ai.api_key", ""),
    baseUrl: read("ai.base_url", "https://api.openai.com/v1").replace(/\/$/, ""),
    model: read("ai.model", "gpt-4o-mini"),
  };
}

const SYSTEM_PROMPT = `You are Hadran, the in-house business analyst for Hadran Fabrics Mall, a luxury fabric and fashion mall in Kubwa, Abuja, Nigeria. The store sells fabrics (Ankara, lace, guinea brocade, cashmere) by the yard, native wear, shoes and jewelry. Currency is Nigerian Naira (₦).

Rules:
- ALWAYS call tools to get real numbers before answering data questions. Never invent figures.
- Answer concisely in markdown: short paragraphs, bullet lists, **bold** key figures, small tables when comparing.
- When data is empty, say so plainly and suggest what to check.
- You are read-only: you cannot change anything. For action requests, explain which screen to use (POS, Inventory, Approvals, etc.).`;

/* ------------------------- tool registry (LLM) ------------------------- */

const TOOL_DEFS = [
  {
    name: "today_snapshot",
    description: "Today's revenue, orders, items sold and discounts, vs yesterday",
    fn: () => tools.todaySnapshot(),
    parameters: { type: "object", properties: {} },
  },
  {
    name: "sales_summary",
    description: "Sales totals over the last N days (default 7)",
    fn: (a: { days?: number }) => tools.salesSummary(a.days ?? 7),
    parameters: { type: "object", properties: { days: { type: "number" } } },
  },
  {
    name: "top_products",
    description: "Best-selling products by revenue over the last N days",
    fn: (a: { days?: number; limit?: number }) => tools.topProducts(a.days ?? 30, a.limit ?? 5),
    parameters: { type: "object", properties: { days: { type: "number" }, limit: { type: "number" } } },
  },
  {
    name: "low_stock",
    description: "Products at or below reorder level",
    fn: () => tools.lowStock(),
    parameters: { type: "object", properties: {} },
  },
  {
    name: "stock_value",
    description: "Inventory valuation at cost and retail, out-of-stock count",
    fn: () => tools.stockValue(),
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_products",
    description: "Search products by name, SKU, colour or barcode",
    fn: (a: { query: string }) => tools.searchProducts(a.query),
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "recent_sales",
    description: "Most recent sales receipts",
    fn: (a: { limit?: number }) => tools.recentSales(a.limit ?? 5),
    parameters: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "staff_performance",
    description: "Cashier leaderboard over the last N days",
    fn: (a: { days?: number }) => tools.staffPerformance(a.days ?? 30),
    parameters: { type: "object", properties: { days: { type: "number" } } },
  },
  {
    name: "pending_approvals",
    description: "Manager actions waiting for admin approval",
    fn: () => tools.pendingApprovals(),
    parameters: { type: "object", properties: {} },
  },
  {
    name: "returns_summary",
    description: "Returns/exchanges count and refunded value over the last N days",
    fn: (a: { days?: number }) => tools.returnsSummary(a.days ?? 30),
    parameters: { type: "object", properties: { days: { type: "number" } } },
  },
  {
    name: "top_customers",
    description: "Highest-spending registered customers over the last N days",
    fn: (a: { days?: number; limit?: number }) => tools.topCustomers(a.days ?? 90, a.limit ?? 5),
    parameters: { type: "object", properties: { days: { type: "number" }, limit: { type: "number" } } },
  },
  {
    name: "payment_breakdown",
    description: "Payment method totals over the last N days",
    fn: (a: { days?: number }) => tools.paymentBreakdown(a.days ?? 30),
    parameters: { type: "object", properties: { days: { type: "number" } } },
  },
] as const;

/* --------------------------- LLM call loop ---------------------------- */

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

async function answerWithLLM(
  config: AiConfig,
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
    { role: "user", content: question },
  ];

  const toolSchemas = TOOL_DEFS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let round = 0; round < 6; round++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let payload: {
      choices?: { message?: ChatMessage }[];
      error?: { message?: string };
    };
    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, tools: toolSchemas, temperature: 0.2 }),
        signal: controller.signal,
      });
      payload = (await res.json()) as typeof payload;
      if (!res.ok) {
        throw new Error(payload.error?.message ?? `AI endpoint returned HTTP ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }

    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("The AI endpoint returned an empty response.");

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content?.trim() || "I couldn't produce an answer — please rephrase the question.";
    }

    messages.push(message);
    for (const call of message.tool_calls) {
      const def = TOOL_DEFS.find((t) => t.name === call.function.name);
      let result: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = def ? await (def.fn as unknown as (a: Record<string, unknown>) => Promise<unknown>)(args) : { error: "Unknown tool" };
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Tool failed" };
      }
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }
  return "I gathered a lot of data but couldn't finish reasoning — try narrowing the question.";
}

/* ------------------------- offline analyst ---------------------------- */

const fmtTable = (headers: string[], rows: string[][]) =>
  `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;

async function answerOffline(question: string): Promise<string> {
  const q = question.toLowerCase();
  const money = tools.money;

  if (/(low (on )?stock|reorder|restock|running (out|low)|out of stock|stock level)/.test(q)) {
    const [low, value] = await Promise.all([tools.lowStock(), tools.stockValue()]);
    if (low.length === 0) return `**Stock is healthy** — nothing is at or below its reorder level.\n\nInventory currently holds **${value.productCount} products** worth **${money(value.costValue)}** at cost (${money(value.retailValue)} at retail).`;
    return `**${low.length} product(s) need restocking:**\n\n${fmtTable(
      ["Product", "SKU", "Stock", "Reorder level"],
      low.map((r) => [r.name, r.sku, `**${r.stock}**`, String(r.reorderLevel)]),
    )}\n\nHead to **Inventory → Low Stock** or raise a purchase order under **Inventory → Purchase Orders**.`;
  }

  if (/(top|best|selling|popular).*(product|item|fabric)|what.*selling/.test(q)) {
    const top = await tools.topProducts(30, 5);
    if (top.length === 0) return "There are no completed sales in the last 30 days yet, so there's nothing to rank.";
    return `**Best sellers — last 30 days:**\n\n${fmtTable(
      ["#", "Product", "Qty sold", "Revenue"],
      top.map((r, i) => [String(i + 1), r.name, `${r.quantity} ${r.unit.toLowerCase()}`, `**${money(r.revenue)}**`]),
    )}`;
  }

  if (/(staff|cashier|team|who).*(perform|best|sales|leaderboard)|performance/.test(q)) {
    const perf = await tools.staffPerformance(30);
    if (perf.length === 0) return "No completed sales in the last 30 days — the leaderboard is empty.";
    return `**Cashier leaderboard — last 30 days:**\n\n${fmtTable(
      ["#", "Staff", "Orders", "Revenue"],
      perf.map((r, i) => [String(i + 1), r.name, String(r.orders), `**${money(r.revenue)}**`]),
    )}`;
  }

  if (/(customer|client).*(top|best|spend)|top.*customer/.test(q)) {
    const cust = await tools.topCustomers(90, 5);
    if (cust.length === 0) return "No registered-customer sales in the last 90 days. Attach customers at the POS to build this picture.";
    return `**Top customers — last 90 days:**\n\n${fmtTable(
      ["Customer", "Code", "Orders", "Spent"],
      cust.map((r) => [r.name, r.code, String(r.orders), `**${money(r.spent)}**`]),
    )}`;
  }

  if (/(return|exchange|refund)/.test(q)) {
    const r = await tools.returnsSummary(30);
    return `**Returns & exchanges — last 30 days:**\n\n- **${r.count}** processed (${r.exchanges} exchange(s))\n- Refunded value: **${money(r.refunded)}**\n\nDetails live under **Sales → Returns & Exchanges**.`;
  }

  if (/(approval|pending|waiting)/.test(q)) {
    const rows = await tools.pendingApprovals();
    if (rows.length === 0) return "**The approval queue is clear** — no manager actions are waiting for review.";
    return `**${rows.length} request(s) awaiting approval:**\n\n${rows.map((r) => `- #${r.id} — ${r.summary} _(by ${r.requester})_`).join("\n")}\n\nReview them under **Approvals → Review Queue**.`;
  }

  if (/(payment|cash|transfer|pos|card).*(breakdown|split|method|how)/.test(q)) {
    const rows = await tools.paymentBreakdown(30);
    if (rows.length === 0) return "No payments recorded in the last 30 days.";
    const grand = rows.reduce((s, r) => s + r.total, 0);
    return `**How customers paid — last 30 days:**\n\n${fmtTable(
      ["Method", "Transactions", "Total", "Share"],
      rows.map((r) => [r.method, String(r.count), `**${money(r.total)}**`, `${((r.total / grand) * 100).toFixed(1)}%`]),
    )}`;
  }

  if (/(stock value|inventory value|valuation|worth)/.test(q)) {
    const v = await tools.stockValue();
    return `**Inventory valuation (live):**\n\n- Products: **${v.productCount}**\n- At cost: **${money(v.costValue)}**\n- At retail: **${money(v.retailValue)}**\n- Potential margin: **${money(v.potentialMargin)}**\n- Out of stock: **${v.outOfStock}** product(s)`;
  }

  if (/(today|this morning|so far|right now)/.test(q)) {
    const s = await tools.todaySnapshot();
    const growth = s.revenueGrowthVsYesterdayPct;
    return `**Today so far vs yesterday (full day):**\n\n- Orders today: **${s.today.orders}** (yesterday: ${s.yesterday.orders})\n- Revenue today: **${money(s.today.revenue)}** (yesterday: ${money(s.yesterday.revenue)})\n- Revenue growth: **${growth == null ? "n/a (no sales yesterday)" : `${growth.toFixed(1)}%`}**\n- Items sold today: **${s.today.items}**\n- Discounts today: ${money(s.today.discounts)}`;
  }

  if (/(yesterday|last week|this week|month|summary|how.*(business|sales|doing))/.test(q)) {
    const s = await tools.salesSummary(q.includes("month") ? 30 : 7);
    return `**Sales summary — last ${s.periodDays} days:**\n\n- Orders: **${s.orders}**\n- Revenue: **${money(s.revenue)}**\n- Average ticket: **${money(s.averageTicket)}**\n- Items sold: **${s.itemsSold}**\n- Discounts given: ${money(s.discounts)} · VAT: ${money(s.vat)}`;
  }

  const productMatch = q.match(/(?:price of|stock of|how much is|find|search)\s+(.+)/);
  if (productMatch) {
    const rows = await tools.searchProducts(productMatch[1].trim());
    if (rows.length === 0) return `I couldn't find any product matching **"${productMatch[1].trim()}"**. Try a name, SKU, colour or barcode.`;
    return `**Found ${rows.length} product(s):**\n\n${fmtTable(
      ["Product", "SKU", "Price", "Stock"],
      rows.map((r) => [r.name, r.sku, `**${money(r.price)}**`, `${r.stock} ${r.unit.toLowerCase()}`]),
    )}`;
  }

  // Default: today's snapshot.
  const snap = await tools.todaySnapshot();
  const growthText =
    snap.revenueGrowthVsYesterdayPct == null
      ? ""
      : ` (${snap.revenueGrowthVsYesterdayPct >= 0 ? "+" : ""}${snap.revenueGrowthVsYesterdayPct.toFixed(1)}% vs yesterday)`;
  return `**Today at Hadran Fabrics Mall:**\n\n- Revenue: **${money(snap.today.revenue)}**${growthText}\n- Orders: **${snap.today.orders}**\n- Items sold: **${snap.today.items}**\n- Discounts: ${money(snap.today.discounts)}\n\nYesterday closed at ${money(snap.yesterday.revenue)} across ${snap.yesterday.orders} order(s).\n\n_Ask me about top products, low stock, staff performance, customers, returns, payments or stock value._`;
}

/* ------------------------------ entrypoint ----------------------------- */

export interface AiAnswer {
  answer: string;
  mode: "cloud" | "offline";
}

export async function answerQuestion(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<AiAnswer> {
  const config = await loadConfig();
  if (config.enabled && config.apiKey) {
    try {
      return { answer: await answerWithLLM(config, question, history), mode: "cloud" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI endpoint unreachable";
      const fallback = await answerOffline(question);
      return {
        answer: `> ⚠️ Cloud AI unavailable (${msg}) — answered from the built-in analyst instead.\n\n${fallback}`,
        mode: "offline",
      };
    }
  }
  return { answer: await answerOffline(question), mode: "offline" };
}
