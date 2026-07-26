import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { FormSection, Field } from "@/components/common/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store, Percent, Receipt, Printer, ShieldCheck, Bot, Cog, Loader2, Save, PlugZap, Eye, EyeOff, Cloud,
} from "lucide-react";
import { toast } from "sonner";

interface SettingRow {
  key: string;
  group: string;
  description: string | null;
  value: unknown;
  masked: string | null;
}

type Draft = Record<string, unknown>;

const GROUPS: { id: string; label: string; icon: typeof Store; permission: string }[] = [
  { id: "STORE", label: "Store Profile", icon: Store, permission: "settings.sales" },
  { id: "SALES", label: "Sales & Tax", icon: Percent, permission: "settings.sales" },
  { id: "RECEIPT", label: "Receipt", icon: Receipt, permission: "settings.sales" },
  { id: "HARDWARE", label: "Hardware", icon: Printer, permission: "settings.hardware" },
  { id: "WORKFLOW", label: "Approval Workflow", icon: ShieldCheck, permission: "settings.sales" },
  { id: "AI", label: "AI Assistant", icon: Bot, permission: "settings.system" },
  { id: "STORAGE", label: "Storage", icon: Cloud, permission: "settings.system" },
  { id: "SYSTEM", label: "System", icon: Cog, permission: "settings.system" },
];

const GATED_ACTIONS: { id: string; label: string; hint: string }[] = [
  { id: "PRODUCT_CREATE", label: "Create products", hint: "New products need approval before going live" },
  { id: "PRODUCT_EDIT", label: "Edit products", hint: "Price/name/category changes need approval" },
  { id: "PRODUCT_DELETE", label: "Delete products", hint: "Archiving a product needs approval" },
  { id: "STOCK_ADJUSTMENT", label: "Stock adjustments", hint: "Manual stock corrections need approval" },
  { id: "VOID_SALE", label: "Void sales", hint: "Cancelling a completed sale needs approval" },
  { id: "RETURN_PROCESS", label: "Returns & exchanges", hint: "Processing a return needs approval" },
  { id: "CUSTOMER_DISCOUNT", label: "Customer discounts", hint: "Creating/changing special discounts needs approval" },
];

/** Keys rendered with a dedicated control instead of type inference. */
const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  "receipt.paper_width_mm": [
    { value: "58", label: "58 mm (narrow thermal)" },
    { value: "80", label: "80 mm (standard thermal)" },
  ],
  "hardware.printer_mode": [
    { value: "BROWSER", label: "Browser print (window.print → thermal driver)" },
    { value: "ESCPOS", label: "ESC/POS raw commands (advanced)" },
  ],
  "hardware.scanner_suffix": [
    { value: "ENTER", label: "Enter key" },
    { value: "TAB", label: "Tab key" },
  ],
};
const TEXTAREA_KEYS = new Set(["receipt.footer_note", "receipt.return_policy", "store.address"]);
const NUMBER_KEYS = new Set([
  "sales.vat_rate", "sales.service_charge_rate", "sales.max_item_discount_percent",
  "sales.max_cart_discount_percent", "sales.loyalty_point_per", "hardware.scanner_min_length",
  "system.session_hours", "system.audit_retention_days",
]);

const label = (key: string) => {
  const part = key.split(".").slice(1).join(" ").replace(/_/g, " ");
  return part.charAt(0).toUpperCase() + part.slice(1);
};

export default function SettingsPage() {
  const { can } = usePermissions();
  const visibleGroups = GROUPS.filter((g) => can(g.permission));
  const [tab, setTab] = useState(visibleGroups[0]?.id ?? "STORE");
  const [draft, setDraft] = useState<Draft>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const listQ = trpc.settings.list.useQuery();
  const updateMut = trpc.settings.update.useMutation();

  const rows = useMemo(() => (listQ.data ?? []) as SettingRow[], [listQ.data]);

  // Initialise the draft once settings arrive.
  useEffect(() => {
    if (rows.length === 0) return;
    setDraft((cur) => {
      if (Object.keys(cur).length > 0) return cur;
      const next: Draft = {};
      for (const r of rows) next[r.key] = r.value;
      return next;
    });
  }, [rows]);

  const set = (key: string, value: unknown) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
    setDirty((cur) => new Set(cur).add(key));
  };

  const groupRows = rows.filter((r) => r.group === tab);
  const groupDirty = groupRows.filter((r) => dirty.has(r.key));

  const save = async () => {
    const entries = groupDirty.map((r) => ({ key: r.key, value: draft[r.key] }));
    if (entries.length === 0) return;
    try {
      const res = await updateMut.mutateAsync({ entries });
      toast.success(res.updated > 0 ? `Saved ${res.updated} setting(s).` : "No changes needed saving.");
      setDirty((cur) => {
        const next = new Set(cur);
        for (const e of entries) next.delete(e.key);
        return next;
      });
      await listQ.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const discard = () => {
    setDraft((cur) => {
      const next = { ...cur };
      for (const r of groupRows) next[r.key] = r.value;
      return next;
    });
    setDirty((cur) => {
      const next = new Set(cur);
      for (const r of groupRows) next.delete(r.key);
      return next;
    });
  };

  if (visibleGroups.length === 0) {
    return (
      <div>
        <PageHeader title="Settings" description="You don't have permission to view any settings section." />
      </div>
    );
  }

  const activeGroup = GROUPS.find((g) => g.id === tab)!;

  const renderControl = (r: SettingRow) => {
    const value = draft[r.key];

    // Secret fields (AI API key) — blank means "keep current".
    if (r.masked !== null) return <SecretField row={r} value={(value as string) ?? ""} onChange={(v) => set(r.key, v)} />;

    // Dedicated selects.
    if (SELECT_OPTIONS[r.key]) {
      return (
        <Select value={String(value)} onValueChange={(v) => set(r.key, r.key === "receipt.paper_width_mm" ? Number(v) : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SELECT_OPTIONS[r.key].map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Gated actions checklist.
    if (r.key === "workflow.gated_actions") {
      const selected = new Set((value as string[]) ?? []);
      return (
        <div className="space-y-2.5 rounded-lg border border-border p-4">
          {GATED_ACTIONS.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={selected.has(a.id)}
                onCheckedChange={(v) => {
                  const next = new Set(selected);
                  if (v) next.add(a.id); else next.delete(a.id);
                  set(r.key, [...next]);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-xs text-muted-foreground">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
      );
    }

    // Type inference.
    if (typeof value === "boolean") {
      return (
        <div className="flex items-center gap-3 pt-1">
          <Switch checked={value} onCheckedChange={(v) => set(r.key, v)} />
          <span className="text-sm text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
        </div>
      );
    }
    if (NUMBER_KEYS.has(r.key)) {
      return (
        <Input
          type="number"
          value={String(value ?? "")}
          onChange={(e) => set(r.key, e.target.value === "" ? 0 : Number(e.target.value))}
        />
      );
    }
    if (TEXTAREA_KEYS.has(r.key)) {
      return <Textarea rows={2} value={(value as string) ?? ""} onChange={(e) => set(r.key, e.target.value)} />;
    }
    return <Input value={(value as string) ?? ""} onChange={(e) => set(r.key, e.target.value)} />;
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Store profile, tax & discounts, receipt layout, hardware, approval rules and system configuration."
        actions={
          groupDirty.length > 0 ? (
            <>
              <Button variant="outline" onClick={discard}>Discard</Button>
              <Button onClick={save} disabled={updateMut.isPending} className="bg-gold text-primary hover:bg-gold/90">
                {updateMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save {groupDirty.length} change{groupDirty.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {visibleGroups.map((g) => (
            <TabsTrigger key={g.id} value={g.id} className="gap-1.5">
              <g.icon className="h-3.5 w-3.5" />
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {listQ.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : (
        <FormSection
          icon={activeGroup.icon}
          title={activeGroup.label}
          description={tab === "AI"
            ? "Cloud AI is optional — without an API key the assistant uses the built-in offline analyst over live data."
            : tab === "WORKFLOW"
              ? "Manager actions checked below must be approved by an Admin or Super Admin before they take effect."
              : undefined}
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            {groupRows.map((r) => (
              <Field
                key={r.key}
                label={label(r.key)}
                hint={r.description ?? undefined}
                full={TEXTAREA_KEYS.has(r.key) || r.key === "workflow.gated_actions" || r.key === "hardware.printer_mode"}
              >
                <div className={dirty.has(r.key) ? "rounded-md ring-2 ring-gold/40" : undefined}>
                  {renderControl(r)}
                </div>
              </Field>
            ))}
          </div>

          {tab === "AI" && <AiTestPanel draft={draft} />}

          {tab === "STORAGE" && (
            <div className="mt-6 space-y-2 rounded-lg border border-dashed border-gold/40 bg-gold/5 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">How file storage works</p>
              <p><b>LOCAL</b> (default) — uploads are saved on this server under <code className="rounded bg-muted px-1">/uploads</code> and served back with login protection. Simple, but uses server disk space.</p>
              <p><b>CLOUDINARY</b> — uploads (product photos, chat attachments, profile photos) go to YOUR Cloudinary account and are served from Cloudinary's CDN: no server disk usage, faster image delivery, plus on-the-fly resizing. Fill in your cloud name + API key + secret below, switch the provider to CLOUDINARY, save — new uploads use Cloudinary from that moment (existing local files keep working).</p>
              <p>Find your credentials in the Cloudinary dashboard → <i>Account Details</i>.</p>
            </div>
          )}
        </FormSection>
      )}
    </div>
  );
}

/** Password-style input for secrets; empty = keep the stored value. */
function SecretField({ row, value, onChange }: { row: SettingRow; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        placeholder={row.masked ? `Current: ${row.masked} — type to replace` : "Not set"}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Live connectivity check against the configured AI endpoint. */
function AiTestPanel({ draft }: { draft: Draft }) {
  const testMut = trpc.settings.testAi.useMutation();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    setResult(null);
    try {
      const res = await testMut.mutateAsync({
        baseUrl: (draft["ai.base_url"] as string) || "https://api.openai.com/v1",
        apiKey: (draft["ai.api_key"] as string) || undefined,
        model: (draft["ai.model"] as string) || "gpt-4o-mini",
      });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
    }
  };

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gold/40 bg-gold/5 px-4 py-3">
      <PlugZap className="h-4 w-4 text-gold" />
      <p className="flex-1 text-sm text-muted-foreground">
        Test the connection with the values above (uses the saved key if the key field is blank).
      </p>
      <Button variant="outline" size="sm" onClick={run} disabled={testMut.isPending}>
        {testMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Test connection
      </Button>
      {result && (
        <Badge variant="outline" className={result.ok ? "border-emerald-500/40 text-emerald-600" : "border-red-500/40 text-red-600"}>
          {result.message}
        </Badge>
      )}
    </div>
  );
}
