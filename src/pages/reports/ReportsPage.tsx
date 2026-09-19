import { Studio } from "@/components/reports/Studio";

/**
 * HADRAN FABRICS MALL — Reports Studio (Phase 8).
 * 30 selectable report types across the Sales, Laundry and Tailoring
 * sections, each with its own filters, KPI cards, charts and tables —
 * exportable to CSV, Excel and print.
 */
export default function ReportsPage() {
  return (
    <Studio
      mode="reports"
      pageTitle="Reports"
      pageDescription="Pick a section and a report type — filters adapt to your choice. Export any result to CSV, Excel or print."
    />
  );
}
