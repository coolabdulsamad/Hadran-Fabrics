import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StockMovementForm } from "@/components/inventory/StockMovementForm";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatQty } from "@/lib/format";
import { MOVEMENT_LABELS, STOCK_MOVEMENT_TYPES } from "@contracts/index";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  movementType: keyof typeof MOVEMENT_LABELS;
  quantity: number;
  unit: string;
  balanceAfter: number;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
  productName: string;
  sku: string;
  performedByName: string | null;
};

const OUT_TYPES = ["STOCK_OUT", "SALE", "EXCHANGE_OUT", "DAMAGE"];

export default function StockMovementsPage() {
  const { can } = usePermissions();
  const [movementType, setMovementType] = useState<string>("");
  const [page, setPage] = useState(1);

  const query = trpc.inventory.movements.useQuery({
    movementType: (movementType || undefined) as (typeof STOCK_MOVEMENT_TYPES)[number] | undefined,
    page,
    pageSize: 20,
  });

  const columns: Column<Row>[] = [
    {
      header: "When",
      render: (m) => (
        <span className="whitespace-nowrap text-xs text-navy-800">{formatDateTime(m.createdAt)}</span>
      ),
    },
    {
      header: "Product",
      render: (m) => (
        <div className="min-w-0">
          <p className="max-w-[260px] truncate font-medium text-navy-900">{m.productName}</p>
          <p className="text-xs text-muted-foreground">{m.sku}</p>
        </div>
      ),
    },
    {
      header: "Type",
      render: (m) => (
        <StatusBadge
          label={MOVEMENT_LABELS[m.movementType] ?? m.movementType}
          tone={OUT_TYPES.includes(m.movementType) ? "red" : m.movementType === "ADJUSTMENT" || m.movementType === "COUNT_CORRECTION" ? "amber" : "green"}
        />
      ),
    },
    {
      header: "Quantity",
      className: "text-right",
      render: (m) => (
        <span className={cn("font-bold", m.quantity >= 0 ? "text-emerald-600" : "text-red-600")}>
          {m.quantity >= 0 ? "+" : ""}
          {formatQty(m.quantity)} <span className="text-[11px] font-normal text-muted-foreground">{m.unit.toLowerCase()}(s)</span>
        </span>
      ),
    },
    {
      header: "Balance After",
      className: "text-right",
      render: (m) => <span className="font-medium text-navy-900">{formatQty(m.balanceAfter)}</span>,
    },
    {
      header: "Reason / Notes",
      render: (m) => (
        <div className="max-w-[240px]">
          <p className="truncate text-xs text-navy-800">{m.reason ?? "—"}</p>
          {m.notes && <p className="truncate text-[11px] text-muted-foreground">{m.notes}</p>}
        </div>
      ),
    },
    {
      header: "By",
      render: (m) => <span className="whitespace-nowrap text-xs text-navy-800">{m.performedByName ?? "System"}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Movements"
        description="The immutable inventory ledger — every unit in or out, who moved it, and the balance after."
        actions={
          <>
            {can("inventory.stock_in") && (
              <StockMovementForm
                mode="IN"
                trigger={
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <ArrowDownToLine className="mr-2 h-4 w-4" />
                    Record Stock-In
                  </Button>
                }
              />
            )}
            {can("inventory.stock_out") && (
              <StockMovementForm
                mode="OUT"
                trigger={
                  <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                    <ArrowUpFromLine className="mr-2 h-4 w-4" />
                    Record Stock-Out
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <div className="card-lux mb-4 flex flex-wrap items-center gap-3 p-4">
        <Select value={movementType} onValueChange={(v) => { setMovementType(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-11 w-[220px] border-input bg-background">
            <SelectValue placeholder="All movement types" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All movement types</SelectItem>
            {STOCK_MOVEMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{MOVEMENT_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={query.data?.items as Row[] | undefined}
        loading={query.isLoading}
        keyFn={(m) => m.id}
        emptyTitle="No movements recorded"
        emptyDescription="Stock-in, stock-out, sales and adjustments all appear here."
        pagination={query.data ? { page, pageSize: 20, total: query.data.total, onPage: setPage } : undefined}
      />
    </div>
  );
}
