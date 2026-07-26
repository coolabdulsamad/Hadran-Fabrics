import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { notifications, users } from "@db/schema";
import type { UserRole } from "@contracts/roles";

/**
 * HADRAN FABRICS MALL — notification delivery.
 * Small in-app inbox per user: approvals needing review, approval outcomes,
 * low-stock alerts and new chat messages.
 */

/** Any executor that can run drizzle queries (the shared DB connection). */
type Db = ReturnType<typeof getDb>;

export type NotificationType = "APPROVAL" | "APPROVAL_RESULT" | "LOW_STOCK" | "CHAT" | "RETURN" | "SYSTEM";

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/** Insert a notification for specific users. */
export async function notifyUsers(userIds: number[], n: NotificationInput, db?: Db) {
  const d = db ?? getDb();
  const unique = [...new Set(userIds)].filter((id) => id > 0);
  if (unique.length === 0) return;
  await d.insert(notifications).values(
    unique.map((userId) => ({
      userId,
      type: n.type,
      title: n.title.slice(0, 200),
      body: n.body?.slice(0, 500) ?? null,
      link: n.link?.slice(0, 300) ?? null,
    })),
  );
}

/** Look up active users with any of the given roles, then notify them. */
export async function notifyRoles(roles: UserRole[], n: NotificationInput, db?: Db, excludeUserId?: number) {
  const d = db ?? getDb();
  const rows: { id: number }[] = await d
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, roles), eq(users.status, "ACTIVE")));
  const ids = rows.map((r) => r.id).filter((id) => id !== excludeUserId);
  await notifyUsers(ids, n, d);
}

/** Unread count for the bell badge. */
export async function unreadCount(userId: number) {
  const db = getDb();
  const [row] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(row?.value ?? 0);
}

/** Latest notifications for one user. */
export async function listMine(userId: number, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.id))
    .limit(limit);
}

/** Mark one or all of the user's notifications read. */
export async function markRead(userId: number, id?: number) {
  const db = getDb();
  if (id) {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  } else {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }
}
