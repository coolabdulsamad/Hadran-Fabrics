import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth.router";
import { dashboardRouter } from "./routers/dashboard.router";
import { categoriesRouter } from "./routers/categories.router";
import { productsRouter } from "./routers/products.router";
import { suppliersRouter } from "./routers/suppliers.router";
import { inventoryRouter } from "./routers/inventory.router";
import { purchasesRouter } from "./routers/purchases.router";
import { salesRouter } from "./routers/sales.router";
import { customersRouter } from "./routers/customers.router";
import { returnsRouter } from "./routers/returns.router";
import { usersRouter } from "./routers/users.router";
import { permissionsRouter } from "./routers/permissions.router";
import { approvalsRouter } from "./routers/approvals.router";
import { reportsRouter } from "./routers/reports.router";
import { chatRouter } from "./routers/chat.router";
import { aiRouter } from "./routers/ai.router";
import { settingsRouter } from "./routers/settings.router";
import { auditRouter } from "./routers/audit.router";
import { notificationsRouter } from "./routers/notifications.router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  auth: authRouter,
  dashboard: dashboardRouter,
  categories: categoriesRouter,
  products: productsRouter,
  suppliers: suppliersRouter,
  inventory: inventoryRouter,
  purchases: purchasesRouter,
  sales: salesRouter,
  customers: customersRouter,
  returns: returnsRouter,
  users: usersRouter,
  permissions: permissionsRouter,
  approvals: approvalsRouter,
  reports: reportsRouter,
  chat: chatRouter,
  ai: aiRouter,
  settings: settingsRouter,
  audit: auditRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
