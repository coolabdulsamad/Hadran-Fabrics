import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Pencil, Tags, FolderTree } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryRow {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

interface DialogState {
  open: boolean;
  editing: CategoryRow | null;
  name: string;
  description: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_DIALOG: DialogState = {
  open: false,
  editing: null,
  name: "",
  description: "",
  parentId: "",
  sortOrder: 0,
  isActive: true,
};

export default function CategoriesPage() {
  const utils = trpc.useUtils();
  const listQuery = trpc.categories.list.useQuery();
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG);

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      toast.success("Category created.");
      setDialog(EMPTY_DIALOG);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: async () => {
      await utils.categories.list.invalidate();
      toast.success("Category updated.");
      setDialog(EMPTY_DIALOG);
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const parents = rows.filter((c) => !c.parentId);
  const childrenOf = (id: number) => rows.filter((c) => c.parentId === id);
  const orphans = rows.filter((c) => c.parentId && !rows.some((p) => p.id === c.parentId));

  const openCreate = () => setDialog({ ...EMPTY_DIALOG, open: true });
  const openEdit = (c: CategoryRow) =>
    setDialog({
      open: true,
      editing: c,
      name: c.name,
      description: c.description ?? "",
      parentId: c.parentId ? String(c.parentId) : "",
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    });

  const save = () => {
    if (dialog.name.trim().length < 2) {
      toast.error("Category name is too short.");
      return;
    }
    const payload = {
      name: dialog.name.trim(),
      description: dialog.description.trim() || undefined,
      parentId: dialog.parentId ? Number(dialog.parentId) : null,
      sortOrder: dialog.sortOrder,
    };
    if (dialog.editing) {
      updateMutation.mutate({ id: dialog.editing.id, ...payload, isActive: dialog.isActive });
    } else {
      createMutation.mutate(payload);
    }
  };

  const renderRow = (c: CategoryRow, depth: number) => (
    <div
      key={c.id}
      className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5 transition hover:bg-gold-50/40"
      style={{ paddingLeft: depth ? `${20 + depth * 28}px` : undefined }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${depth ? "bg-gold-100" : "bg-navy-800"}`}>
          <Tags className={`h-4 w-4 ${depth ? "text-gold-700" : "text-gold-400"}`} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy-900">{c.name}</p>
          {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="rounded-full bg-cream-200 px-2.5 py-1 text-xs font-semibold text-navy-700">
          {c.productCount} product{c.productCount === 1 ? "" : "s"}
        </span>
        {!c.isActive && <StatusBadge label="INACTIVE" tone="gray" />}
        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8 text-navy-600 hover:bg-gold-50 hover:text-gold-700">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (listQuery.isLoading) return <LoadingScreen label="Loading categories…" />;

  return (
    <div>
      <PageHeader
        title="Categories"
        description="The store's category tree — fabric sub-categories sit under Fabrics; shoes, jewelry and others stand alone."
        actions={
          <Button onClick={openCreate} className="bg-navy-800 text-cream-100 hover:bg-navy-700">
            <PlusCircle className="mr-2 h-4 w-4 text-gold-400" />
            Add Category
          </Button>
        }
      />

      <div className="card-lux overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-cream-200/60 px-5 py-3">
          <FolderTree className="h-4 w-4 text-gold-600" />
          <p className="text-xs font-bold uppercase tracking-wider text-navy-700">
            {rows.length} categories · {parents.length} top-level
          </p>
        </div>
        {parents.map((p) => (
          <div key={p.id}>
            {renderRow(p, 0)}
            {childrenOf(p.id).map((c) => renderRow(c, 1))}
          </div>
        ))}
        {orphans.map((c) => renderRow(c, 0))}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog(EMPTY_DIALOG)}>
        <DialogContent className="border-gold-500/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-navy-900">
              {dialog.editing ? `Edit — ${dialog.editing.name}` : "Add Category"}
            </DialogTitle>
            <DialogDescription>
              {dialog.editing ? "Update this category's details." : "Create a new catalog category."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Name *</label>
              <input
                className="input-lux"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Ankara (Wax Print)"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Description</label>
              <textarea
                rows={2}
                className="input-lux h-auto py-2.5"
                value={dialog.description}
                onChange={(e) => setDialog((d) => ({ ...d, description: e.target.value }))}
                placeholder="What lives in this category…"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Parent</label>
                <Select value={dialog.parentId} onValueChange={(v) => setDialog((d) => ({ ...d, parentId: v === "NONE" ? "" : v }))}>
                  <SelectTrigger className="h-11 border-input bg-background">
                    <SelectValue placeholder="Top level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Top level —</SelectItem>
                    {parents
                      .filter((p) => p.id !== dialog.editing?.id)
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy-700">Sort order</label>
                <input
                  type="number"
                  min="0"
                  className="input-lux"
                  value={dialog.sortOrder}
                  onChange={(e) => setDialog((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            {dialog.editing && (
              <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
                <Switch checked={dialog.isActive} onCheckedChange={(v) => setDialog((d) => ({ ...d, isActive: v }))} />
                <span className="text-sm text-navy-800">Active (visible across the app)</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(EMPTY_DIALOG)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-navy-800 text-cream-100 hover:bg-navy-700"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : dialog.editing ? "Save Changes" : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
