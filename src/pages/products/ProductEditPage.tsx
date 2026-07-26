import { useNavigate, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductForm, type ProductFormValues } from "@/components/inventory/ProductForm";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { EmptyState } from "@/components/common/EmptyState";

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const productId = Number(id);

  const query = trpc.products.byId.useQuery({ id: productId }, { enabled: Number.isFinite(productId) });

  if (query.isLoading) return <LoadingScreen label="Loading product…" />;
  if (!query.data) {
    return <EmptyState title="Product not found" description="It may have been removed." />;
  }

  const p = query.data.product;
  const defaults: Partial<ProductFormValues> = {
    sku: p.sku,
    barcode: p.barcode ?? "",
    name: p.name,
    description: p.description ?? "",
    categoryId: p.categoryId,
    supplierId: p.supplierId,
    productType: p.productType,
    materialType: p.materialType,
    color: p.color ?? "",
    pattern: p.pattern ?? "",
    brand: p.brand ?? "",
    unitOfMeasure: p.unitOfMeasure,
    packSize: p.packSize,
    allowFractional: p.allowFractional,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    wholesalePrice: p.wholesalePrice,
    taxRate: p.taxRate,
    taxExempt: p.taxExempt,
    discountEligible: p.discountEligible,
    reorderLevel: p.reorderLevel,
    shelfLocation: p.shelfLocation ?? "",
    primaryImageUrl: p.primaryImageUrl ?? "",
    extraImageUrls: query.data.images
      .filter((img) => img.url !== p.primaryImageUrl)
      .map((img) => img.url)
      .join("\n"),
    status: p.status,
  };

  return (
    <div>
      <PageHeader
        title={`Edit — ${p.name}`}
        description={`SKU ${p.sku} · Manager edits are submitted to Admin for approval before they apply.`}
      />
      <ProductForm
        mode="edit"
        productId={productId}
        defaults={defaults}
        onDone={() => navigate(`/products/${productId}`)}
      />
    </div>
  );
}
