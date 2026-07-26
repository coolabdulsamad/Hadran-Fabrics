import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { createRouter } from "../middleware";
import { permissionProcedure } from "../trpc";
import { getDb } from "../queries/connection";
import {
  chatConversations,
  chatMessages,
  chatParticipants,
  customers,
  products,
  sales,
  users,
} from "@db/schema";
import { MESSAGE_REFERENCE_TYPES } from "@contracts/constants";
import { logAudit, requestMeta } from "../services/audit.service";

/**
 * HADRAN FABRICS MALL — team chat router (all roles).
 * Direct & group conversations, text/image/document messages, and
 * entity references — a product, sale, customer or return attached to
 * a message renders as a deep-link chip for the whole team.
 */

async function assertParticipant(conversationId: number, userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.conversationId, conversationId), eq(chatParticipants.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You are not part of this conversation." });
  return rows[0];
}

const referenceInput = z
  .object({
    type: z.enum(MESSAGE_REFERENCE_TYPES),
    id: z.number().int().positive(),
  })
  .nullable()
  .optional();

export const chatRouter = createRouter({
  /** Staff you can start a chat with. */
  staffOptions: permissionProcedure("chat.use").query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({ id: users.id, fullName: users.fullName, role: users.role, staffCode: users.staffCode })
      .from(users)
      .where(and(eq(users.status, "ACTIVE"), ne(users.id, ctx.user.id)))
      .orderBy(asc(users.fullName));
  }),

  /** My conversations with last message + unread count. */
  conversations: permissionProcedure("chat.use").query(async ({ ctx }) => {
    const db = getDb();
    const memberships = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, ctx.user.id));
    if (memberships.length === 0) return [];

    const convIds = memberships.map((m) => m.conversationId);
    const convs = await db
      .select()
      .from(chatConversations)
      .where(inArray(chatConversations.id, convIds));

    const result = [];
    for (const conv of convs) {
      const participants = await db
        .select({ userId: chatParticipants.userId, fullName: users.fullName, role: users.role })
        .from(chatParticipants)
        .innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.conversationId, conv.id));

      const last = await db
        .select({ body: chatMessages.body, createdAt: chatMessages.createdAt, senderId: chatMessages.senderId, attachmentType: chatMessages.attachmentType })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id))
        .orderBy(desc(chatMessages.id))
        .limit(1);

      const me = memberships.find((m) => m.conversationId === conv.id)!;
      const [unread] = await db
        .select({ value: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conv.id),
            ne(chatMessages.senderId, ctx.user.id),
            gt(chatMessages.id, me.lastReadMessageId ?? 0),
          ),
        );

      const others = participants.filter((p) => p.userId !== ctx.user.id);
      const title =
        conv.type === "GROUP"
          ? (conv.name ?? "Group chat")
          : (others[0]?.fullName ?? "Former staff member");

      result.push({
        id: conv.id,
        type: conv.type,
        title,
        participants,
        lastMessage: last[0] ?? null,
        unreadCount: Number(unread?.value ?? 0),
      });
    }
    // Most recently active first.
    result.sort((a, b) => {
      const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });
    return result;
  }),

  /** Find-or-create a direct conversation with a colleague. */
  openDirect: permissionProcedure("chat.use")
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot chat with yourself." });

      const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });

      // Existing direct conversation shared by both?
      const mine = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, ctx.user.id));
      for (const m of mine) {
        const conv = await db.select().from(chatConversations).where(eq(chatConversations.id, m.conversationId)).limit(1);
        if (conv[0]?.type !== "DIRECT") continue;
        const other = await db
          .select()
          .from(chatParticipants)
          .where(and(eq(chatParticipants.conversationId, m.conversationId), eq(chatParticipants.userId, input.userId)))
          .limit(1);
        if (other[0]) return { conversationId: m.conversationId, created: false };
      }

      const [conv] = await db.insert(chatConversations).values({ type: "DIRECT", createdBy: ctx.user.id }).$returningId();
      await db.insert(chatParticipants).values([
        { conversationId: conv.id, userId: ctx.user.id },
        { conversationId: conv.id, userId: input.userId },
      ]);
      return { conversationId: conv.id, created: true };
    }),

  createGroup: permissionProcedure("chat.use")
    .input(
      z.object({
        title: z.string().min(2, "Give the group a name").max(120),
        memberIds: z.array(z.number().int().positive()).min(1, "Add at least one colleague"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [conv] = await db
        .insert(chatConversations)
        .values({ type: "GROUP", name: input.title.trim(), createdBy: ctx.user.id })
        .$returningId();
      const unique = Array.from(new Set([ctx.user.id, ...input.memberIds]));
      await db.insert(chatParticipants).values(unique.map((userId) => ({ conversationId: conv.id, userId })));
      return { conversationId: conv.id };
    }),

  /** Paginated message history (newest page first, load older with beforeId). */
  messages: permissionProcedure("chat.use")
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        beforeId: z.number().int().positive().optional(),
        limit: z.number().int().min(5).max(200).default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      await assertParticipant(input.conversationId, ctx.user.id);

      const conds: SQL[] = [eq(chatMessages.conversationId, input.conversationId)];
      if (input.beforeId) conds.push(sql`${chatMessages.id} < ${input.beforeId}`);

      const rows = await db
        .select({
          message: chatMessages,
          senderName: users.fullName,
          senderRole: users.role,
        })
        .from(chatMessages)
        .innerJoin(users, eq(chatMessages.senderId, users.id))
        .where(and(...conds))
        .orderBy(desc(chatMessages.id))
        .limit(input.limit);

      return {
        messages: rows.reverse().map((r) => ({ ...r.message, senderName: r.senderName, senderRole: r.senderRole })),
        hasMore: rows.length === input.limit,
      };
    }),

  send: permissionProcedure("chat.use")
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        body: z.string().max(4000).optional(),
        attachmentUrl: z.string().max(500).optional(),
        attachmentName: z.string().max(255).optional(),
        attachmentType: z.enum(["IMAGE", "DOCUMENT"]).optional(),
        reference: referenceInput,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await assertParticipant(input.conversationId, ctx.user.id);

      const body = input.body?.trim() ?? "";
      if (!body && !input.attachmentUrl && !input.reference) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Write a message, attach a file, or reference something." });
      }

      // Resolve the reference label so chips render nicely for everyone.
      let referenceLabel: string | null = null;
      if (input.reference) {
        const ref = input.reference;
        if (ref.type === "PRODUCT") {
          const rows = await db.select().from(products).where(eq(products.id, ref.id)).limit(1);
          referenceLabel = rows[0] ? `${rows[0].name} (${rows[0].sku})` : null;
        } else if (ref.type === "SALE") {
          const rows = await db.select().from(sales).where(eq(sales.id, ref.id)).limit(1);
          referenceLabel = rows[0] ? rows[0].receiptNo : null;
        } else if (ref.type === "CUSTOMER") {
          const rows = await db.select().from(customers).where(eq(customers.id, ref.id)).limit(1);
          referenceLabel = rows[0] ? `${rows[0].fullName} (${rows[0].code})` : null;
        }
        if (!referenceLabel) throw new TRPCError({ code: "NOT_FOUND", message: "That reference no longer exists." });
      }

      const [row] = await db
        .insert(chatMessages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          body: body || null,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentName: input.attachmentName ?? null,
          attachmentType: input.attachmentType ?? null,
          referenceType: input.reference?.type ?? null,
          referenceId: input.reference?.id ?? null,
          referenceLabel,
        })
        .$returningId();

      // Sender has obviously read up to their own message.
      await db
        .update(chatParticipants)
        .set({ lastReadMessageId: row.id })
        .where(and(eq(chatParticipants.conversationId, input.conversationId), eq(chatParticipants.userId, ctx.user.id)));

      // Notify the other participants (drives the bell + sound).
      try {
        const others = await db
          .select({ userId: chatParticipants.userId })
          .from(chatParticipants)
          .where(and(eq(chatParticipants.conversationId, input.conversationId), ne(chatParticipants.userId, ctx.user.id)));
        if (others.length > 0) {
          const { notifyUsers } = await import("../services/notifications.service");
          const preview = body
            ? body.length > 80 ? `${body.slice(0, 80)}…` : body
            : input.attachmentName ? `📎 ${input.attachmentName}` : "Sent a reference";
          await notifyUsers(others.map((o) => o.userId), {
            type: "CHAT",
            title: `New message from ${ctx.user.fullName}`,
            body: preview,
            link: "/chat",
          });
        }
      } catch {
        /* notifications must never break chat */
      }

      return { id: row.id };
    }),

  markRead: permissionProcedure("chat.use")
    .input(z.object({ conversationId: z.number().int().positive(), messageId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await assertParticipant(input.conversationId, ctx.user.id);
      await db
        .update(chatParticipants)
        .set({ lastReadMessageId: input.messageId })
        .where(and(eq(chatParticipants.conversationId, input.conversationId), eq(chatParticipants.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** Total unread across all conversations (for the sidebar badge). */
  unreadTotal: permissionProcedure("chat.use").query(async ({ ctx }) => {
    const db = getDb();
    const memberships = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, ctx.user.id));
    let total = 0;
    for (const m of memberships) {
      const [row] = await db
        .select({ value: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, m.conversationId),
            ne(chatMessages.senderId, ctx.user.id),
            gt(chatMessages.id, m.lastReadMessageId ?? 0),
          ),
        );
      total += Number(row?.value ?? 0);
    }
    return { count: total };
  }),

  /** Search products / sales / customers to reference in a message. */
  searchEntities: permissionProcedure("chat.use")
    .input(z.object({ query: z.string().min(1).max(80), type: z.enum(MESSAGE_REFERENCE_TYPES) }))
    .query(async ({ input }) => {
      const db = getDb();
      const q = `%${input.query.trim()}%`;
      if (input.type === "PRODUCT") {
        const rows = await db
          .select({ id: products.id, name: products.name, sku: products.sku, price: products.sellingPrice, stock: products.currentStock })
          .from(products)
          .where(and(or(like(products.name, q), like(products.sku, q)), ne(products.status, "ARCHIVED")))
          .limit(8);
        return rows.map((r) => ({ id: r.id, label: `${r.name} (${r.sku})`, hint: `₦${r.price.toLocaleString()} • ${r.stock} in stock` }));
      }
      if (input.type === "SALE") {
        const rows = await db
          .select({ id: sales.id, receiptNo: sales.receiptNo, grandTotal: sales.grandTotal, status: sales.status })
          .from(sales)
          .where(like(sales.receiptNo, q))
          .orderBy(desc(sales.createdAt))
          .limit(8);
        return rows.map((r) => ({ id: r.id, label: r.receiptNo, hint: `₦${r.grandTotal.toLocaleString()} • ${r.status}` }));
      }
      const rows = await db
        .select({ id: customers.id, fullName: customers.fullName, code: customers.code, phone: customers.phone })
        .from(customers)
        .where(or(like(customers.fullName, q), like(customers.code, q), like(customers.phone, q)))
        .limit(8);
      return rows.map((r) => ({ id: r.id, label: `${r.fullName} (${r.code})`, hint: r.phone ?? "" }));
    }),

  /**
   * Delete a conversation.
   * DIRECT: either participant may delete — the whole thread is removed for both.
   * GROUP: only the creator may delete; other members can leave instead.
   */
  deleteConversation: permissionProcedure("chat.use")
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await assertParticipant(input.conversationId, ctx.user.id);
      const convRows = await db.select().from(chatConversations).where(eq(chatConversations.id, input.conversationId)).limit(1);
      const conv = convRows[0];
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      if (conv.type === "GROUP" && conv.createdBy !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the group's creator can delete it — you can leave instead.",
        });
      }
      await db.delete(chatConversations).where(eq(chatConversations.id, conv.id));
      await logAudit({
        actorId: ctx.user.id,
        action: "chat.delete",
        entityType: "CHAT",
        entityId: conv.id,
        description: `${ctx.user.fullName} deleted the ${conv.type.toLowerCase()} conversation${conv.name ? ` "${conv.name}"` : ""} and its messages.`,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),

  /** Leave a group conversation (direct chats are deleted instead). */
  leaveConversation: permissionProcedure("chat.use")
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await assertParticipant(input.conversationId, ctx.user.id);
      const convRows = await db.select().from(chatConversations).where(eq(chatConversations.id, input.conversationId)).limit(1);
      const conv = convRows[0];
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      if (conv.type !== "GROUP") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Direct chats can't be left — delete the conversation instead." });
      }
      if (conv.createdBy === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You created this group — delete it instead of leaving." });
      }
      await db
        .delete(chatParticipants)
        .where(and(eq(chatParticipants.conversationId, conv.id), eq(chatParticipants.userId, ctx.user.id)));
      await logAudit({
        actorId: ctx.user.id,
        action: "chat.leave",
        entityType: "CHAT",
        entityId: conv.id,
        description: `${ctx.user.fullName} left the group "${conv.name ?? conv.id}".`,
        ...requestMeta(ctx.req),
      });
      return { ok: true };
    }),
});
