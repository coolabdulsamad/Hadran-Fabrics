import { relations } from "drizzle-orm";
import {
  users,
  sessions,
  userPermissions,
  categories,
  suppliers,
  products,
  productImages,
  purchases,
  purchaseItems,
  stockMovements,
  stockCounts,
  stockCountItems,
  customers,
  sales,
  saleItems,
  salePayments,
  returns,
  returnItems,
  approvalRequests,
  chatConversations,
  chatParticipants,
  chatMessages,
  aiConversations,
  aiMessages,
  notifications,
  auditLogs,
} from "./schema";

/** Drizzle relations — powers the db.query.* nested-select API. */

export const usersRelations = relations(users, ({ one, many }) => ({
  creator: one(users, { fields: [users.createdBy], references: [users.id], relationName: "userCreator" }),
  sessions: many(sessions),
  permissionOverrides: many(userPermissions),
  sales: many(sales),
  stockMovements: many(stockMovements, { relationName: "movementPerformer" }),
  approvalRequestsMade: many(approvalRequests, { relationName: "approvalRequester" }),
  approvalRequestsReviewed: many(approvalRequests, { relationName: "approvalReviewer" }),
  chatParticipants: many(chatParticipants),
  chatMessages: many(chatMessages),
  aiConversations: many(aiConversations),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
  granter: one(users, { fields: [userPermissions.grantedBy], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "categoryParent",
  }),
  children: many(categories, { relationName: "categoryParent" }),
  products: many(products),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  purchases: many(purchases),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
  images: many(productImages),
  stockMovements: many(stockMovements),
  saleItems: many(saleItems),
  purchaseItems: many(purchaseItems),
  creator: one(users, { fields: [products.createdBy], references: [users.id], relationName: "productCreator" }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  items: many(purchaseItems),
  creator: one(users, { fields: [purchases.createdBy], references: [users.id] }),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  performer: one(users, {
    fields: [stockMovements.performedBy],
    references: [users.id],
    relationName: "movementPerformer",
  }),
  approver: one(users, { fields: [stockMovements.approvedBy], references: [users.id] }),
}));

export const stockCountsRelations = relations(stockCounts, ({ one, many }) => ({
  items: many(stockCountItems),
  starter: one(users, { fields: [stockCounts.startedBy], references: [users.id] }),
  approver: one(users, { fields: [stockCounts.approvedBy], references: [users.id] }),
}));

export const stockCountItemsRelations = relations(stockCountItems, ({ one }) => ({
  count: one(stockCounts, { fields: [stockCountItems.countId], references: [stockCounts.id] }),
  product: one(products, { fields: [stockCountItems.productId], references: [products.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  cashier: one(users, { fields: [sales.cashierId], references: [users.id] }),
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  voider: one(users, { fields: [sales.voidedBy], references: [users.id], relationName: "saleVoider" }),
  items: many(saleItems),
  payments: many(salePayments),
  returns: many(returns),
}));

export const saleItemsRelations = relations(saleItems, ({ one, many }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
  returnItems: many(returnItems),
}));

export const salePaymentsRelations = relations(salePayments, ({ one }) => ({
  sale: one(sales, { fields: [salePayments.saleId], references: [sales.id] }),
}));

export const returnsRelations = relations(returns, ({ one, many }) => ({
  sale: one(sales, { fields: [returns.saleId], references: [sales.id] }),
  items: many(returnItems),
  processor: one(users, { fields: [returns.processedBy], references: [users.id], relationName: "returnProcessor" }),
  approver: one(users, { fields: [returns.approvedBy], references: [users.id], relationName: "returnApprover" }),
}));

export const returnItemsRelations = relations(returnItems, ({ one }) => ({
  return: one(returns, { fields: [returnItems.returnId], references: [returns.id] }),
  saleItem: one(saleItems, { fields: [returnItems.saleItemId], references: [saleItems.id] }),
  product: one(products, { fields: [returnItems.productId], references: [products.id] }),
  exchangeProduct: one(products, {
    fields: [returnItems.exchangeProductId],
    references: [products.id],
    relationName: "exchangeProduct",
  }),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
  requester: one(users, {
    fields: [approvalRequests.requesterId],
    references: [users.id],
    relationName: "approvalRequester",
  }),
  reviewer: one(users, {
    fields: [approvalRequests.reviewerId],
    references: [users.id],
    relationName: "approvalReviewer",
  }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  creator: one(users, { fields: [chatConversations.createdBy], references: [users.id] }),
  participants: many(chatParticipants),
  messages: many(chatMessages),
}));

export const chatParticipantsRelations = relations(chatParticipants, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatParticipants.conversationId],
    references: [chatConversations.id],
  }),
  user: one(users, { fields: [chatParticipants.userId], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));
