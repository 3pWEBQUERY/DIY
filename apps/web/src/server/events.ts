import "server-only";
import { db, type Tx } from "@/server/db";

/**
 * Domänenereignisse (PRD §27.3). Werden per Outbox transaktional gespeichert und
 * vom Worker an pg-boss-Queues (Benachrichtigungen, Suche, Analytics, Mails) verteilt.
 */
export type DomainEvent =
  | { type: "PostPublished"; postId: string; authorId: string }
  | { type: "ProjectUpdated"; projectId: string; ownerId: string; updateId?: string }
  | { type: "ProjectRemixed"; projectId: string; originalId: string; ownerId: string }
  | { type: "TutorialPublished"; tutorialId: string; authorId: string; version: number; major: boolean }
  | { type: "UserFollowed"; followerId: string; followeeId: string }
  | { type: "CommentCreated"; commentId: string; authorId: string }
  | { type: "ProductPurchased"; orderId: string }
  | { type: "PaymentConfirmed"; orderId: string; paymentId: string }
  | { type: "OrderShipped"; orderId: string }
  | { type: "OrderStatusChanged"; orderId: string; to: string }
  | { type: "ReportCreated"; caseId: string }
  | { type: "ModerationDecisionRecorded"; caseId: string; actionId: string }
  | { type: "MessageSent"; messageId: string; conversationId: string }
  | { type: "ArticlePublished"; articleId: string; authorId: string }
  | { type: "UserDeleted"; userId: string };

export async function emit(event: DomainEvent, tx?: Tx) {
  const client = tx ?? db;
  const { type, ...payload } = event;
  await client.outboxEvent.create({ data: { type, payload } });
}
