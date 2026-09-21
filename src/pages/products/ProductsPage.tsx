import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PlusCircle, Search, Eye, Pencil, Archive, Package } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge, toneForStatus } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatQty } from "@/lib/format";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@contracts/index";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  productType: string;
  unitOfMeasure: string;
  sellingPrice: number;
  /** Company-wide total across all branches. */
  currentStock: number;
  /** Stock physically held at the active branch. */
  branchStock: number;
  reorderLevel: number;
  primaryImageUrl: string | null;
  status: string;
  approvalStatus: string;
  categoryName: string;
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { can } = usePermissions();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [productType, setProductType] = useState<string>("");
  const [status, setStatus] = useState<string>("ACTIVE");
  const [page, setPage] = useState(1);

  const categoriesQuery = trpc.categories.list.useQuery();
  const listQuery = trpc.products.list.useQuery({
    search: search || undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    productType: (productType || undefined) as (typeof PRODUCT_TYPES)[number] | undefined,
    status: (status || undefined) as "DRAFT" | "ACTIVE" | "ARCHIVED" | undefined,
    page,
    pageSize: 15,
  });

  const archiveMutation = trpc.products.archive.useMutation({
    onSuccess: async (res) => {
      await utils.products.list.invalidate();
      if (res.pending) toast.info("Archive request sent to Admin for approval.");
      else toast.success("Product archived.");
    },
    onError: (e) => toast.error(e.message),
  });

  const columns: Column<Row>[] = [
    {
      header: "Product",
      render: (p) => (
        <div className="flex items-center gap-3">
          {p.primaryImageUrl ? (
            <img src={p.primaryImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-800">
              <Package className="h-4 w-4 text-gold-400" />
            </span>
          )}
          <div className="min-w-0">
            <Link to={`/products/${p.id}`} className="block max-w-[280px] truncate font-medium text-navy-900 hover:text-gold-700 hover:underline">
              {p.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {p.sku} · {p.categoryName}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: "Type",
      render: (p) => (
        <span className="text-xs text-navy-700">
          {PRODUCT_TYPE_LABELS[p.productType as keyof typeof PRODUCT_TYPE_LABELS] ?? p.productType}
        </span>
      ),
    },
    {
      header: "Price",
      className: "text-right",
      render: (p) => (
        <div className="text-right">
          <p className="font-semibold text-navy-900">{formatCurrency(p.sellingPrice)}</p>
          <p className="text-[11px] text-muted-foreground">per {p.unitOfMeasure.toLowerCase()}</p>
        </div>
      ),
    },
    {
      header: "Stock (this branch)",
      className: "text-right",
      render: (p) => (
        <div className="text-right">
          <span
            className={cn(
              "font-bold",
              p.branchStock <= 0 ? "text-red-600" : p.branchStock <= p.reorderLevel ? "text-amber-600" : "text-emerald-600",
            )}
          >
            {formatQty(p.branchStock)}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{p.unitOfMeasure.toLowerCase()}(s)</span>
          </span>
          <p className="text-[10px] text-muted-foreground">all branches: {formatQty(p.currentStock)}</p>
        </div>
      ),
    },
    {
      header: "Status",
      render: (p) => (
        <div className="flex flex-col gap-1">
          <StatusBadge label={p.status} tone={toneForStatus(p.status)} />
          {p.approvalStatus === "PENDING" && <StatusBadge label="AWAITING APPROVAL" tone="gold" />}
        </div>
      ),
    },
    {
      header: "Actions",
      className: "text-right",
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/products/${p.id}`)} className="h-8 w-8 text-navy-600 hover:bg-gold-50 hover:text-gold-700" title="View details">
            <Eye className="h-4 w-4" />
          </Button>
          {can("products.edit") && (
            <Button variant="ghost" size="icon" onClick={() => navigate(`/products/${p.id}/edit`)} className="h-8 w-8 text-navy-600 hover:bg-gold-50 hover:text-gold-700" title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can("products.delete") && p.status !== "ARCHIVED" && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" title="Archive">
                  <Archive className="h-4 w-4" />
                </Button>
              }
              title="Archive this product?"
              description={`"${p.name}" will be hidden from the POS and catalog. Its sales history and stock records are preserved.`}
              confirmLabel="Archive"
              destructive
              onConfirm={() => archiveMutation.mutate({ id: p.id })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        description="The complete store catalog — fabrics by the yard, native wear, shoes, jewelry and accessories."
        actions={
          can("products.create") ? (
            <Button asChild className="bg-navy-800 text-cream-100 hover:bg-navy-700">
              <Link to="/products/new">
                <PlusCircle className="mr-2 h-4 w-4 text-gold-400" />
                Add Product
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="card-lux mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-600" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, SKU, barcode, color, brand…"
            className="input-lux pl-10"
          />
        </div>
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-11 w-[190px] border-input bg-background">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All categories</SelectItem>
            {(categoriesQuery.data ?? []).filter((c) => c.isActive).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.parentId ? "— " : ""}{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={productType} onValueChange={(v) => { setProductType(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-11 w-[190px] border-input bg-background">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {PRODUCT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-11 w-[150px] border-input bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={listQuery.data?.items as Row[] | undefined}
        loading={listQuery.isLoading}
        keyFn={(p) => p.id}
        emptyTitle="No products found"
        emptyDescription="Adjust your filters, or add the first product to the catalog."
        pagination={
          listQuery.data
            ? { page, pageSize: 15, total: listQuery.data.total, onPage: setPage }
            : undefined
        }
      />
    </div>
  );
}
