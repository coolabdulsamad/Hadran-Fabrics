import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { authedProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { SECTIONS, type Section } from "@contracts/constants";
import { resolveRange, toCatalog } from "../reports/shared";
import { ANALYSIS_DEFS, findAnalysisDef } from "../reports/analysis-defs";

/**
 * HADRAN FABRICS MALL — Analysis Studio router (Phase 8).
 * Chart-first analysis types keyed by business section. Access: managers via
 * analytics.view/reports.view for SALES; section staff via their view
 * permission for LAUNDRY/TAILORING; reports.general unlocks everything.
 */

function analysisPermitted(permissions: Set<string>, section: Section): boolean {
  if (permissions.has("reports.general")) return true;
  if (section === "SALES") return permissions.has("analytics.view") || permissions.has("reports.view");
  if (section === "LAUNDRY") return permissions.has("laundry.view") || permissions.has("analytics.view");
  return permissions.has("tailoring.view") || permissions.has("analytics.view");
}

function assertAnalysisAccess(permissions: Set<string>, section: Section) {
  if (!analysisPermitted(permissions, section)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You don't have permission to view ${section.toLowerCase()} analysis.`,
    });
  }
}

export const analyticsRouter = createRouter({
  /** Catalog of analysis types the caller is allowed to see. */
  catalog: authedProcedure.query(({ ctx }) => ({
    analyses: ANALYSIS_DEFS.filter((d) => analysisPermitted(ctx.permissions, d.section)).map(toCatalog),
  })),

  /** Run one analysis type with a date range + filter values. */
  run: authedProcedure
    .input(
      z.object({
        section: z.enum(SECTIONS),
        type: z.string().max(60),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        filters: z.record(z.string(), z.string()).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      assertAnalysisAccess(ctx.permissions, input.section);
      const def = findAnalysisDef(input.type, input.section);
      if (!def) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Unknown analysis type "${input.type}" for ${input.section}.` });
      }
      const range = resolveRange(input.dateFrom, input.dateTo);
      const result = await def.run({
        db: getDb(),
        activeBranch: ctx.activeBranch,
        filters: input.filters ?? {},
        range,
      });
      return {
        title: def.label,
        section: def.section,
        type: def.type,
        generatedAt: new Date().toISOString(),
        ...result,
      };
    }),
});
