import { Studio } from "@/components/reports/Studio";

/**
 * HADRAN FABRICS MALL — Analysis Studio (Phase 8).
 * 22 chart-first analysis types across the three business sections:
 * trends, mixes, funnels, leaderboards and performance patterns.
 */
export default function AnalyticsPage() {
  return (
    <Studio
      mode="analyses"
      pageTitle="Analytics"
      pageDescription="Visual, chart-first analysis of every section — trends, mixes, funnels and performance patterns. Export or print any view."
    />
  );
}
