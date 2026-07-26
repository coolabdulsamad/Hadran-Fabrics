import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Package,
  Tags,
  Ruler,
  Banknote,
  Boxes,
  ImageIcon,
  FileText,
  RefreshCw,
  Dices,
  Save,
  Loader2,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { FormSection, Field } from "@/components/common/FormSection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProductImagePicker } from "./ProductImagePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MATERIAL_TYPES,
  MATERIAL_TYPE_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  UNITS,
  UNIT_LABELS,
  STORE,
} from "@contracts/index";

/**
 * HADRAN FABRICS MALL — ProductForm
 * The complete product form: identity, classification, measurement units
 * (yards / packs / measured cuts), pricing, inventory, media and notes.
 * Used by both the create and edit pages.
 */

const formSchema = z.object({
  sku: z.string().min(3, "SKU is required (min 3 chars)").max(50),
  barcode: z.string().max(64).optional(),
  name: z.string().min(3, "Product name is too short").max(255),
  description: z.string().max(3000).optional(),
  categoryId: z.number({ error: "Select a category" }).int().positive(),
  supplierId: z.number().int().positive().nullable().optional(),
  productType: z.enum(PRODUCT_TYPES),
  materialType: z.enum(MATERIAL_TYPES).nullable().optional(),
  color: z.string().max(80).optional(),
  pattern: z.string().max(120).optional(),
  brand: z.string().max(120).optional(),
  unitOfMeasure: z.enum(UNITS),
  packSize: z.number().positive("Pack size must be positive").nullable().optional(),
  allowFractional: z.boolean(),
  costPrice: z.number().min(0, "Cost price cannot be negative"),
  sellingPrice: z.number().min(0.01, "Selling price is required"),
  wholesalePrice: z.number().min(0).nullable().optional(),
  taxRate: z.number().min(0).max(100),
  taxExempt: z.boolean(),
  discountEligible: z.boolean(),
  reorderLevel: z.number().min(0),
  shelfLocation: z.string().max(80).optional(),
  primaryImageUrl: z.string().max(500).optional(),
  extraImageUrls: z.string().max(1500).optional(), // newline-separated
  openingStock: z.number().min(0).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export type ProductFormValues = z.infer<typeof formSchema>;

interface ProductFormProps {
  mode: "create" | "edit";
  productId?: number;
  defaults?: Partial<ProductFormValues>;
  onDone: (result: { pending: boolean; id?: number }) => void;
}

const EMPTY_DEFAULTS: ProductFormValues = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  categoryId: 0,
  supplierId: null,
  productType: "FABRIC",
  materialType: null,
  color: "",
  pattern: "",
  brand: "",
  unitOfMeasure: "PIECE",
  packSize: null,
  allowFractional: false,
  costPrice: 0,
  sellingPrice: 0,
  wholesalePrice: null,
  taxRate: 0, // 0 = inherit the store VAT setting
  taxExempt: false,
  discountEligible: true,
  reorderLevel: 3,
  shelfLocation: "",
  primaryImageUrl: "",
  extraImageUrls: "",
  openingStock: 0,
  status: "ACTIVE",
};

export function ProductForm({ mode, productId, defaults, onDone }: ProductFormProps) {
  const utils = trpc.useUtils();
  const categoriesQuery = trpc.categories.list.useQuery();
  const suppliersQuery = trpc.suppliers.options.useQuery(undefined, { retry: false });

  const createMutation = trpc.products.create.useMutation();
  const updateMutation = trpc.products.update.useMutation();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...EMPTY_DEFAULTS, ...defaults },
  });

  useEffect(() => {
    if (defaults) {
      for (const [k, v] of Object.entries(defaults)) {
        setValue(k as keyof ProductFormValues, v as never);
      }
    }
  }, [defaults, setValue]);

  const unit = watch("unitOfMeasure");
  const categoryId = watch("categoryId");
  const isFabricLike = unit === "YARD" || unit === "PACK";

  const suggestSku = async () => {
    if (!categoryId) {
      toast.error("Select a category first — the SKU prefix comes from it.");
      return;
    }
    try {
      const res = await utils.products.suggestSku.fetch({ categoryId });
      setValue("sku", res.sku, { shouldValidate: true });
      toast.success(`SKU suggested: ${res.sku}`);
    } catch {
      toast.error("Could not suggest a SKU.");
    }
  };

  const generateBarcode = () => {
    // EAN-13 style locally-generated code starting with 61
    const body = "61" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
    setValue("barcode", body, { shouldValidate: true });
    toast.success("Barcode generated — print labels from the Barcode Labels page.");
  };

  const onSubmit = async (values: ProductFormValues) => {
    const imageUrls = [
      ...(values.primaryImageUrl ? [values.primaryImageUrl.trim()] : []),
      ...(values.extraImageUrls ?? "")
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean),
    ].slice(0, 6);

    const payload = {
      ...values,
      sku: values.sku.trim().toUpperCase(),
      barcode: values.barcode?.trim() || "",
      supplierId: values.supplierId || null,
      materialType: values.materialType || null,
      packSize: values.packSize || null,
      wholesalePrice: values.wholesalePrice ?? null,
      primaryImageUrl: values.primaryImageUrl?.trim() || "",
      imageUrls,
      description: values.description || "",
    };

    try {
      if (mode === "create") {
        const res = await createMutation.mutateAsync(payload);
        await utils.products.list.invalidate();
        if (res.pending) {
          toast.info("Sent to Admin for approval", {
            description: "The product will appear in the catalog once approved.",
          });
          onDone({ pending: true });
        } else {
          toast.success("Product created", { description: `${values.name} is now in the catalog.` });
          onDone({ pending: false, id: res.id });
        }
      } else {
        const { openingStock: _drop, ...updatePayload } = payload;
        const res = await updateMutation.mutateAsync({ ...updatePayload, id: productId! });
        await utils.products.list.invalidate();
        await utils.products.byId.invalidate({ id: productId! });
        if (res.pending) {
          toast.info("Edits sent to Admin for approval", {
            description: "Changes apply once an Admin approves the request.",
          });
          onDone({ pending: true, id: productId });
        } else {
          toast.success("Product updated");
          onDone({ pending: false, id: productId });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the product.");
    }
  };

  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* ---------------- IDENTITY ---------------- */}
      <FormSection icon={Package} title="Product Identity" description="Name, SKU and barcode — the barcode is what the scanner reads at the till.">
        <Field label="Product Name" required error={errors.name?.message} full>
          <input className="input-lux" placeholder="e.g. Premium Ankara Wax Print — Royal Blue & Gold" {...register("name")} />
        </Field>
        <Field label="SKU" required error={errors.sku?.message} hint="Unique stock-keeping code.">
          <div className="flex gap-2">
            <input className="input-lux uppercase" placeholder="ANK-0001" {...register("sku")} />
            <Button type="button" variant="outline" onClick={suggestSku} className="h-11 shrink-0 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              <RefreshCw className="mr-1.5 h-4 w-4 text-gold-600" />
              Suggest
            </Button>
          </div>
        </Field>
        <Field label="Barcode" error={errors.barcode?.message} hint="Scan the pack label or generate one.">
          <div className="flex gap-2">
            <input className="input-lux" placeholder="6123450000011" {...register("barcode")} />
            <Button type="button" variant="outline" onClick={generateBarcode} className="h-11 shrink-0 border-gold-500/40 text-navy-800 hover:bg-gold-50">
              <Dices className="mr-1.5 h-4 w-4 text-gold-600" />
              Generate
            </Button>
          </div>
        </Field>
      </FormSection>

      {/* ---------------- CLASSIFICATION ---------------- */}
      <FormSection icon={Tags} title="Classification" description="Where this item lives on the shop floor.">
        <Field label="Category" required error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger className="h-11 border-input bg-background">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(categoriesQuery.data ?? [])
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.parentId ? "— " : ""}
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Product Type" required error={errors.productType?.message}>
          <Controller
            control={control}
            name="productType"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-11 border-input bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Material / Fabric Type" hint="For fabrics: Ankara, Lace, Wool…">
          <Controller
            control={control}
            name="materialType"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || null)}>
                <SelectTrigger className="h-11 border-input bg-background">
                  <SelectValue placeholder="Select material…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {MATERIAL_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>{MATERIAL_TYPE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <input className="input-lux" placeholder="e.g. Royal Blue & Gold" {...register("color")} />
        </Field>
        <Field label="Pattern" error={errors.pattern?.message}>
          <input className="input-lux" placeholder="e.g. Geometric wax print" {...register("pattern")} />
        </Field>
        <Field label="Brand" error={errors.brand?.message}>
          <input className="input-lux" placeholder="e.g. Vlisco, Swiss Voile" {...register("brand")} />
        </Field>
      </FormSection>

      {/* ---------------- MEASUREMENT ---------------- */}
      <FormSection icon={Ruler} title="Units & Measurement" description="How this item is sold — whole pieces, or measured & cut (yards).">
        <Field label="Sold By" required>
          <Controller
            control={control}
            name="unitOfMeasure"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-11 border-input bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field
          label="Pack Size"
          hint={isFabricLike ? "e.g. 6 yards in one full pack." : "Only for pack-sold items."}
          error={errors.packSize?.message}
        >
          <input
            type="number"
            step="0.5"
            min="0"
            className="input-lux"
            placeholder="6"
            {...register("packSize", { setValueAs: (v) => (v === "" || v == null ? null : num(v)) })}
          />
        </Field>
        <Field label="Measured Cuts" full hint="Allow selling fractions — e.g. cut 3.5 yards from a full pack at the POS.">
          <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
            <Controller
              control={control}
              name="allowFractional"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
            <span className="text-sm text-navy-800">Allow measured &amp; cut sales for this item</span>
          </div>
        </Field>
      </FormSection>

      {/* ---------------- PRICING ---------------- */}
      <FormSection icon={Banknote} title="Pricing & Tax" description={`All amounts in ${STORE.currency} (₦).`}>
        <Field label="Cost Price (₦)" required error={errors.costPrice?.message} hint="What you buy it for — per unit.">
          <input type="number" step="0.01" min="0" className="input-lux" {...register("costPrice", { valueAsNumber: true })} />
        </Field>
        <Field label="Selling Price (₦)" required error={errors.sellingPrice?.message} hint={`Per ${unit.toLowerCase()}.`}>
          <input type="number" step="0.01" min="0" className="input-lux" {...register("sellingPrice", { valueAsNumber: true })} />
        </Field>
        <Field label="Wholesale Price (₦)" error={errors.wholesalePrice?.message} hint="Optional bulk price.">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input-lux"
            {...register("wholesalePrice", { setValueAs: (v) => (v === "" || v == null ? null : num(v)) })}
          />
        </Field>
        <Field
          label="VAT Rate Override (%)"
          error={errors.taxRate?.message}
          hint={`0 = inherit the store VAT rate (Settings → Sales & Tax, currently ${STORE.defaultVatRate}% by default). Set >0 only to override for this product.`}
        >
          <input type="number" step="0.1" min="0" max="100" className="input-lux" {...register("taxRate", { valueAsNumber: true })} />
        </Field>
        <Field label="VAT Exempt" full hint="Exempt products are never charged VAT, whatever the store rate is.">
          <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
            <Controller
              control={control}
              name="taxExempt"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
            <span className="text-sm text-navy-800">This product is VAT-exempt</span>
          </div>
        </Field>
        <Field label="Discounts" full hint="Can cashiers discount this item at the POS?">
          <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
            <Controller
              control={control}
              name="discountEligible"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
            <span className="text-sm text-navy-800">Eligible for item &amp; cart discounts</span>
          </div>
        </Field>
      </FormSection>

      {/* ---------------- INVENTORY ---------------- */}
      <FormSection icon={Boxes} title="Inventory" description="Stock thresholds, supplier and shelf placement.">
        {mode === "create" && (
          <Field label="Opening Stock" error={errors.openingStock?.message} hint={`Initial quantity in ${unit.toLowerCase()}s (recorded as stock-in).`}>
            <input type="number" step="0.5" min="0" className="input-lux" {...register("openingStock", { setValueAs: (v) => (v === "" ? 0 : num(v)) })} />
          </Field>
        )}
        <Field label="Reorder Level" error={errors.reorderLevel?.message} hint="Low-stock alert triggers at/below this.">
          <input type="number" step="0.5" min="0" className="input-lux" {...register("reorderLevel", { setValueAs: (v) => (v === "" ? 0 : num(v)) })} />
        </Field>
        <Field label="Supplier" hint="Optional default supplier.">
          <Controller
            control={control}
            name="supplierId"
            render={({ field }) => (
              <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(v ? Number(v) : null)}>
                <SelectTrigger className="h-11 border-input bg-background">
                  <SelectValue placeholder="Select supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliersQuery.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Shelf / Wall Location" error={errors.shelfLocation?.message}>
          <input className="input-lux" placeholder="e.g. Ankara Wall A1" {...register("shelfLocation")} />
        </Field>
        <Field label="Status" required>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-11 border-input bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active — sellable</SelectItem>
                  <SelectItem value="DRAFT">Draft — hidden from POS</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </FormSection>

      {/* ---------------- MEDIA ---------------- */}
      <FormSection icon={ImageIcon} title="Images" description="Upload photos from your device or paste image URLs — the first photo is the primary image shown in the catalog and POS.">
        <div className="md:col-span-2">
          <Controller
            control={control}
            name="primaryImageUrl"
            render={({ field: primaryField }) => (
              <Controller
                control={control}
                name="extraImageUrls"
                render={({ field: extraField }) => {
                  const extras = (extraField.value ?? "").split("\n").map((u) => u.trim()).filter(Boolean);
                  const images = [...(primaryField.value?.trim() ? [primaryField.value.trim()] : []), ...extras];
                  return (
                    <ProductImagePicker
                      images={images}
                      onChange={(next) => {
                        primaryField.onChange(next[0] ?? "");
                        extraField.onChange(next.slice(1).join("\n"));
                      }}
                    />
                  );
                }}
              />
            )}
          />
        </div>
      </FormSection>

      {/* ---------------- DESCRIPTION ---------------- */}
      <FormSection icon={FileText} title="Description & Notes" description="Full details staff see on the product page.">
        <Field label="Description" error={errors.description?.message} full>
          <textarea rows={4} className="input-lux h-auto py-2.5" placeholder="Quality, texture, occasion, care instructions…" {...register("description")} />
        </Field>
      </FormSection>

      {/* ---------------- ACTIONS ---------------- */}
      <div className="flex items-center justify-end gap-3 pb-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 min-w-[180px] bg-navy-800 font-semibold text-cream-100 hover:bg-navy-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4 text-gold-400" />
              {mode === "create" ? "Create Product" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
