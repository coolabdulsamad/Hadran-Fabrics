import { Link, useParams } from "react-router";
import {
  Pencil,
  Package,
  Barcode as BarcodeIcon,
  Tags,
  Ruler,
  Banknote,
  Boxes,
  Truck,
  MapPin,
  User,
  CalendarDays,
  ArrowDownUp,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime, formatQty, timeAgo } from "@/lib/format";
import { MATERIAL_TYPE_LABELS, MOVEMENT_LABELS, PRODUCT_TYPE_LABELS } from "@contracts/index";
import { cn } from "@/lib/utils";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-navy-900">{value ?? "—"}</span>
    </div>
  );
}

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { can } = usePermissions();

  const query = trpc.products.byId.useQuery({ id: productId }, { enabled: Number.isFinite(productId) });

  if (query.isLoading) return <LoadingScreen label="Loading product details…" />;
  if (!query.data) return <EmptyState title="Product not found" description="It may have been removed from the catalog." />;

  const { product: p, categoryName, supplierName, creatorName, images, movements } = query.data;
  const lowStock = p.currentStock <= p.reorderLevel;

  return (
    <div>
      <PageHeader
        title={p.name}
        description={`${p.sku} · ${categoryName}${p.barcode ? ` · Barcode ${p.barcode}` : ""}`}
        actions={
          can("products.edit") ? (
            <Button asChild className="bg-navy-800 text-cream-100 hover:bg-navy-700">
              <Link to={`/products/${p.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4 text-gold-400" />
                Edit Product
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Left column — media + description */}
        <div className="space-y-5">
          <div className="card-lux overflow-hidden">
            {p.primaryImageUrl ? (
              <img src={p.primaryImageUrl} alt={p.name} className="h-64 w-full object-cover" />
            ) : (
              <div className="flex h-64 items-center justify-center bg-navy-800">
                <Package className="h-14 w-14 text-gold-400/60" />
              </div>
            )}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {images.map((img) => (
                  <img key={img.id} src={img.url} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover" />
                ))}
              </div>
            )}
          </div>

          <div className="card-lux p-5">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
              <Tags className="h-4 w-4 text-gold-600" />
              Description
            </h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-navy-800">
              {p.description || "No description recorded for this product."}
            </p>
          </div>

          <div className="card-lux p-5">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
              <BarcodeIcon className="h-4 w-4 text-gold-600" />
              Record Info
            </h3>
            <div className="mt-2 divide-y divide-border/70">
              <InfoRow label="Created by" value={<span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-gold-600" />{creatorName ?? "—"}</span>} />
              <InfoRow label="Created" value={<span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-gold-600" />{formatDateTime(p.createdAt)}</span>} />
              <InfoRow label="Last updated" value={formatDateTime(p.updatedAt)} />
            </div>
          </div>
        </div>

        {/* Right column — details */}
        <div className="space-y-5 xl:col-span-2">
          {/* Status strip */}
          <div className="card-lux flex flex-wrap items-center gap-3 p-4">
            <StatusBadge label={p.status} tone={toneForStatus(p.status)} />
            {p.approvalStatus === "PENDING" && <StatusBadge label="AWAITING ADMIN APPROVAL" tone="gold" />}
            {lowStock && <StatusBadge label="LOW STOCK" tone="red" />}
            {p.allowFractional && <StatusBadge label="MEASURED CUTS ALLOWED" tone="navy" />}
            {p.discountEligible && <StatusBadge label="DISCOUNT ELIGIBLE" tone="green" />}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="card-lux p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
                <Tags className="h-4 w-4 text-gold-600" />
                Classification
              </h3>
              <div className="mt-2 divide-y divide-border/70">
                <InfoRow label="Category" value={categoryName} />
                <InfoRow label="Type" value={PRODUCT_TYPE_LABELS[p.productType]} />
                <InfoRow label="Material" value={p.materialType ? MATERIAL_TYPE_LABELS[p.materialType] : "—"} />
                <InfoRow label="Color" value={p.color} />
                <InfoRow label="Pattern" value={p.pattern} />
                <InfoRow label="Brand" value={p.brand} />
              </div>
            </div>

            <div className="card-lux p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
                <Ruler className="h-4 w-4 text-gold-600" />
                Measurement
              </h3>
              <div className="mt-2 divide-y divide-border/70">
                <InfoRow label="Sold by" value={p.unitOfMeasure.toLowerCase()} />
                <InfoRow label="Pack size" value={p.packSize ? `${formatQty(p.packSize)} ${p.unitOfMeasure.toLowerCase()}s per pack` : "—"} />
                <InfoRow label="Measured cuts" value={p.allowFractional ? "Yes — can cut fractions at POS" : "No — whole units only"} />
                <InfoRow label="Shelf" value={<span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gold-600" />{p.shelfLocation ?? "—"}</span>} />
                <InfoRow label="Supplier" value={<span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-gold-600" />{supplierName ?? "—"}</span>} />
              </div>
            </div>

            <div className="card-lux p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
                <Banknote className="h-4 w-4 text-gold-600" />
                Pricing
              </h3>
              <div className="mt-2 divide-y divide-border/70">
                <InfoRow label="Selling price" value={<span className="font-display text-lg font-bold text-navy-900">{formatCurrency(p.sellingPrice)}</span>} />
                <InfoRow label="Cost price" value={formatCurrency(p.costPrice)} />
                <InfoRow label="Wholesale" value={p.wholesalePrice ? formatCurrency(p.wholesalePrice) : "—"} />
                <InfoRow
                  label="Margin"
                  value={
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(p.sellingPrice - p.costPrice)} (
                      {p.costPrice > 0 ? Math.round(((p.sellingPrice - p.costPrice) / p.costPrice) * 100) : 0}%)
                    </span>
                  }
                />
                <InfoRow label="Tax rate" value={`${p.taxRate}%`} />
              </div>
            </div>

            <div className="card-lux p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
                <Boxes className="h-4 w-4 text-gold-600" />
                Stock
              </h3>
              <div className="mt-2 divide-y divide-border/70">
                <InfoRow
                  label="Current stock"
                  value={
                    <span className={cn("font-display text-lg font-bold", lowStock ? "text-red-600" : "text-emerald-600")}>
                      {formatQty(p.currentStock)} {p.unitOfMeasure.toLowerCase()}(s)
                    </span>
                  }
                />
                <InfoRow label="Reorder level" value={`${formatQty(p.reorderLevel)} ${p.unitOfMeasure.toLowerCase()}(s)`} />
                <InfoRow label="Stock value (cost)" value={formatCurrency(p.currentStock * p.costPrice)} />
                <InfoRow label="Stock value (retail)" value={formatCurrency(p.currentStock * p.sellingPrice)} />
              </div>
            </div>
          </div>

          {/* Movement history */}
          <div className="card-lux">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-navy-900">
                <ArrowDownUp className="h-4 w-4 text-gold-600" />
                Recent Stock Movements
              </h3>
              {can("inventory.view") && (
                <Link to="/inventory/movements" className="text-xs font-medium text-gold-700 hover:underline">
                  Full ledger
                </Link>
              )}
            </div>
            {movements.length === 0 ? (
              <EmptyState title="No movements yet" description="Stock activity for this product will appear here." />
            ) : (
              <ul className="divide-y divide-border/70">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900">
                        {MOVEMENT_LABELS[m.movementType] ?? m.movementType}
                        {m.reason ? <span className="text-muted-foreground"> — {m.reason}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.performedByName ?? "System"} · {timeAgo(m.createdAt)} · balance after: {formatQty(m.balanceAfter)}
                      </p>
                    </div>
                    <span className={cn("shrink-0 text-sm font-bold", m.quantity >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {m.quantity >= 0 ? "+" : ""}
                      {formatQty(m.quantity)} {m.unit.toLowerCase()}(s)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
