import { z } from "zod";
import { createRouter } from "../middleware";
import { authedProcedure } from "../trpc";
import { listMine, markRead, unreadCount } from "../services/notifications.service";

/** HADRAN FABRICS MALL — my notification inbox (powers the topbar bell). */
export const notificationsRouter = createRouter({
  list: authedProcedure.query(({ ctx }) => listMine(ctx.user.id)),

  unreadCount: authedProcedure.query(({ ctx }) => unreadCount(ctx.user.id)),

  markRead: authedProcedure
    .input(z.object({ id: z.number().int().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      await markRead(ctx.user.id, input.id);
      return { ok: true };
    }),
});
