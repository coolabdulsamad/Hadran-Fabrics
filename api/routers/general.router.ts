import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { resolveRange } from "../reports/shared";
import {
  GENERAL_ANALYSIS_DEFS,
  GENERAL_REPORT_DEFS,
  findGeneralAnalysisDef,
  findGeneralReportDef,
  toGeneralCatalog,
} from "../reports/general-defs";

/**
 * HADRAN FABRICS MALL — General Studio router (Phase 9).
 * Cross-section / cross-branch reports & analyses that merge records from
 * Sales, Laundry and Tailoring into unified views. Access: reports.general
 * (Admin and above). Non-main-branch users remain pinned to their branch
 * through the shared branchFilter logic.
 */

export const generalRouter = createRouter({
  /** Both catalogs at once — the General Studio hosts reports AND analyses. */
  catalog: permissionProcedure("reports.general").query(() => ({
    reports: GENERAL_REPORT_DEFS.map(toGeneralCatalog),
    analyses: GENERAL_ANALYSIS_DEFS.map(toGeneralCatalog),
  })),

  /** Run one general report or analysis type. */
  run: permissionProcedure("reports.general")
    .input(
      z.object({
        kind: z.enum(["report", "analysis"]),
        type: z.string().max(60),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        filters: z.record(z.string(), z.string()).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const def =
        input.kind === "report" ? findGeneralReportDef(input.type) : findGeneralAnalysisDef(input.type);
      if (!def) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Unknown general ${input.kind} type "${input.type}".` });
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
