import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import { aiConversations, aiMessages } from "@db/schema";
import { answerQuestion } from "../services/ai.service";
import { logAudit, requestMeta } from "../services/audit.service";

/**
 * HADRAN FABRICS MALL — AI assistant router.
 * Per-user conversations persisted across sessions; every question is
 * answered from live database tools (cloud LLM when configured, the
 * built-in analyst otherwise).
 */

export const aiRouter = createRouter({
  conversations: permissionProcedure("ai.use").query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, ctx.user.id))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(30);
  }),

  messages: permissionProcedure("ai.use")
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conv = await db.select().from(aiConversations).where(eq(aiConversations.id, input.conversationId)).limit(1);
      if (!conv[0] || conv[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }
      return db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, input.conversationId))
        .orderBy(asc(aiMessages.id))
        .limit(200);
    }),

  ask: permissionProcedure("ai.use")
    .input(
      z.object({
        question: z.string().min(2, "Ask something").max(1000),
        conversationId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Continue an existing conversation or start a new one.
      let conversationId = input.conversationId;
      if (conversationId) {
        const conv = await db.select().from(aiConversations).where(eq(aiConversations.id, conversationId)).limit(1);
        if (!conv[0] || conv[0].userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
        }
      } else {
        const title = input.question.length > 60 ? `${input.question.slice(0, 57)}…` : input.question;
        const [row] = await db
          .insert(aiConversations)
          .values({ userId: ctx.user.id, title })
          .$returningId();
        conversationId = row.id;
      }

      // Recent history for context.
      const historyRows = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(asc(aiMessages.id))
        .limit(20);
      const history = historyRows.map((m) => ({
        role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      }));

      await db.insert(aiMessages).values({ conversationId, role: "USER", content: input.question });

      const { answer, mode } = await answerQuestion(input.question, history);

      const [assistant] = await db
        .insert(aiMessages)
        .values({ conversationId, role: "ASSISTANT", content: answer })
        .$returningId();

      await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));

      await logAudit({
        actorId: ctx.user.id,
        action: "ai.ask",
        entityType: "AI_CONVERSATION",
        entityId: conversationId,
        description: `${ctx.user.fullName} asked the AI assistant: "${input.question.slice(0, 120)}" (${mode} mode).`,
        ...requestMeta(ctx.req),
      });

      return { conversationId, messageId: assistant.id, answer, mode };
    }),

  deleteConversation: permissionProcedure("ai.use")
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const conv = await db.select().from(aiConversations).where(eq(aiConversations.id, input.conversationId)).limit(1);
      if (!conv[0] || conv[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }
      await db.delete(aiMessages).where(eq(aiMessages.conversationId, input.conversationId));
      await db.delete(aiConversations).where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, ctx.user.id)));
      return { ok: true };
    }),
});
