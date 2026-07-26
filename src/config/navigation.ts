import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  History,
  RotateCcw,
  Package,
  Tags,
  Barcode,
  Boxes,
  ArrowDownUp,
  SlidersHorizontal,
  ClipboardCheck,
  AlertTriangle,
  Truck,
  ShoppingBag,
  Users,
  UserCog,
  KeyRound,
  FileBarChart,
  PieChart,
  Bot,
  MessageSquare,
  BadgeCheck,
  Settings,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

/**
 * HADRAN FABRICS MALL — sidebar navigation model.
 * Items are filtered at render time by the user's effective permissions:
 *   permission → required key; anyOf → any one of the keys is enough.
 */

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
  anyOf?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "POS Terminal", path: "/pos", icon: ShoppingCart, permission: "pos.sell" },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "My Sales", path: "/sales/my", icon: Receipt, permission: "sales.view_own_history" },
      { label: "Sales History", path: "/sales", icon: History, permission: "sales.view_all_history" },
      { label: "Returns & Exchanges", path: "/returns", icon: RotateCcw, permission: "returns.view" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", path: "/products", icon: Package, permission: "products.view" },
      { label: "Categories", path: "/products/categories", icon: Tags, permission: "products.manage_categories" },
      { label: "Barcode Labels", path: "/products/barcodes", icon: Barcode, permission: "products.print_barcodes" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Overview", path: "/inventory", icon: Boxes, permission: "inventory.view" },
      { label: "Stock Movements", path: "/inventory/movements", icon: ArrowDownUp, permission: "inventory.view" },
      { label: "Adjustments", path: "/inventory/adjustments", icon: SlidersHorizontal, permission: "inventory.adjust" },
      { label: "Stock Count", path: "/inventory/count", icon: ClipboardCheck, permission: "inventory.stock_count" },
      { label: "Low Stock", path: "/inventory/low-stock", icon: AlertTriangle, permission: "inventory.view" },
      { label: "Suppliers", path: "/inventory/suppliers", icon: Truck, permission: "inventory.manage_suppliers" },
      { label: "Purchase Orders", path: "/inventory/purchases", icon: ShoppingBag, permission: "inventory.manage_purchases" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Customers", path: "/customers", icon: Users, permission: "customers.view" },
      { label: "Staff", path: "/users", icon: UserCog, permission: "users.view" },
      { label: "Roles & Permissions", path: "/users/permissions", icon: KeyRound, permission: "permissions.manage" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: "reports.view" },
      { label: "Analytics", path: "/analytics", icon: PieChart, permission: "analytics.view" },
      { label: "AI Assistant", path: "/ai", icon: Bot, permission: "ai.use" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Team Chat", path: "/chat", icon: MessageSquare, permission: "chat.use" },
      { label: "Approvals", path: "/approvals", icon: BadgeCheck, anyOf: ["approvals.request", "approvals.review"] },
      { label: "Settings", path: "/settings", icon: Settings, anyOf: ["settings.sales", "settings.hardware", "settings.system"] },
      { label: "Audit Logs", path: "/settings/audit-logs", icon: ScrollText, permission: "audit.view" },
    ],
  },
];

/** Filter sections/items down to what a permission set may see. */
export function visibleSections(permissions: ReadonlySet<string>): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.permission && !permissions.has(item.permission)) return false;
      if (item.anyOf && !item.anyOf.some((p) => permissions.has(p))) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

/** Resolve a path → its nav label (used by the topbar/breadcrumbs). */
export function pageTitleFor(pathname: string): string {
  let best: { label: string; len: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.path || pathname.startsWith(item.path + "/")) {
        if (!best || item.path.length > best.len) best = { label: item.label, len: item.path.length };
      }
    }
  }
  return best?.label ?? "Dashboard";
}
