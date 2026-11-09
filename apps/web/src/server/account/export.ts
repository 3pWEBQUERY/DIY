import "server-only";
import { db } from "@/server/db";

/**
 * Datenauskunft (revDSG Art. 25 / Datenportabilität Art. 28, DSGVO Art. 15/20, PRD §23.1):
 * alle personenbezogenen Daten eines Kontos als JSON. Nicht enthalten sind Geheimnisse
 * (Passwort-Hash, 2FA-Schlüssel, Wiederherstellungscodes, Tokens) und Daten anderer Personen
 * (z. B. Nachrichten anderer in gemeinsamen Unterhaltungen – nur die eigenen).
 */
export async function exportUserData(userId: string) {
  const [user, preference, customerDetails, subscription, sessions, devices, authAccounts] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, role: true, status: true, locale: true, createdAt: true, lastSeenAt: true, onboardedAt: true, termsAcceptedAt: true, adultConfirmedAt: true, totpEnabledAt: true, profile: true },
    }),
    db.userPreference.findUnique({ where: { userId } }),
    db.customerDetails.findUnique({ where: { userId } }),
    db.subscription.findUnique({ where: { userId }, select: { plan: true, interval: true, status: true, provider: true, priceMinor: true, currency: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true } }),
    db.session.findMany({ where: { userId }, select: { deviceLabel: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true } }),
    db.pushDevice.findMany({ where: { userId }, select: { platform: true, userAgent: true, createdAt: true, lastSeenAt: true, disabledAt: true } }),
    db.authAccount.findMany({ where: { userId }, select: { provider: true, createdAt: true } }),
  ]);

  const [posts, coauthorships, projects, contributions, tutorials, tutorialProgress, articles, comments, reactions, pollVotes] = await Promise.all([
    db.post.findMany({ where: { authorId: userId }, select: { id: true, body: true, visibility: true, state: true, communityId: true, createdAt: true, publishedAt: true, media: { select: { alt: true, media: { select: { variants: true } } } } } }),
    db.postCoauthor.findMany({ where: { userId }, select: { postId: true, status: true, createdAt: true, respondedAt: true } }),
    db.project.findMany({ where: { ownerId: userId }, include: { updates: true, materials: true, tools: true } }),
    db.projectContributor.findMany({ where: { userId }, select: { projectId: true, role: true, createdAt: true } }),
    db.tutorial.findMany({ where: { authorId: userId }, include: { versions: { include: { steps: true } } } }),
    db.tutorialProgress.findMany({ where: { userId } }),
    db.blogArticle.findMany({ where: { authorId: userId } }),
    db.comment.findMany({ where: { authorId: userId }, select: { id: true, body: true, createdAt: true, targetType: true, targetId: true, state: true } }),
    db.reaction.findMany({ where: { userId }, select: { targetType: true, targetId: true, kind: true, createdAt: true } }),
    db.pollVote.findMany({ where: { userId }, select: { pollId: true, optionId: true, createdAt: true } }),
  ]);

  const [follows, followers, bookmarks, collections, blocks, mutes, memberships, eventAttendance, challengeEntries, challengeVotes] = await Promise.all([
    db.follow.findMany({ where: { followerId: userId }, select: { followee: { select: { profile: { select: { handle: true } } } }, createdAt: true } }),
    db.follow.count({ where: { followeeId: userId } }),
    db.bookmark.findMany({ where: { userId } }),
    db.collection.findMany({ where: { ownerId: userId }, include: { items: true } }),
    db.userBlock.findMany({ where: { blockerId: userId }, select: { blocked: { select: { profile: { select: { handle: true } } } }, createdAt: true } }),
    db.userMute.findMany({ where: { muterId: userId }, select: { muted: { select: { profile: { select: { handle: true } } } }, createdAt: true } }),
    db.communityMember.findMany({ where: { userId }, select: { role: true, joinedAt: true, community: { select: { slug: true, name: true } } } }),
    db.eventAttendee.findMany({ where: { userId }, select: { status: true, createdAt: true, event: { select: { id: true, title: true, startsAt: true } } } }),
    db.challengeEntry.findMany({ where: { userId }, select: { challengeId: true, projectId: true, note: true, place: true, voteCount: true, state: true, createdAt: true } }),
    db.challengeVote.findMany({ where: { userId }, select: { challengeId: true, entryId: true, createdAt: true } }),
  ]);

  const [messages, conversations, shop, orders, reviews, entitlements, shoppingLists, materialStock, media] = await Promise.all([
    db.message.findMany({ where: { senderId: userId }, select: { id: true, conversationId: true, body: true, createdAt: true } }),
    db.conversationMember.findMany({ where: { userId }, select: { conversationId: true, role: true, joinedAt: true, lastReadAt: true, archivedAt: true } }),
    db.shop.findUnique({
      where: { ownerId: userId },
      select: {
        id: true, slug: true, name: true, tagline: true, description: true, country: true, currency: true, shippingPolicy: true, returnPolicy: true, processingDays: true, status: true, createdAt: true,
        products: { select: { id: true, slug: true, title: true, description: true, priceMinor: true, currency: true, status: true, createdAt: true } },
        orders: { select: { id: true, number: true, status: true, totalMinor: true, currency: true, createdAt: true, paidAt: true } },
      },
    }),
    db.order.findMany({ where: { buyerId: userId }, include: { items: true, shipments: true, refunds: { select: { amountMinor: true, status: true, createdAt: true } } } }),
    db.review.findMany({ where: { authorId: userId }, select: { id: true, productId: true, productRating: true, sellerRating: true, body: true, sellerReply: true, createdAt: true } }),
    db.digitalEntitlement.findMany({ where: { userId }, select: { productId: true, orderItemId: true, version: true, downloadCount: true, downloadLimit: true, revokedAt: true, createdAt: true } }),
    db.shoppingList.findMany({ where: { ownerId: userId }, include: { items: true } }),
    db.materialStock.findMany({ where: { userId }, select: { name: true, quantity: true, note: true, material: { select: { slug: true } }, createdAt: true, updatedAt: true } }),
    db.media.findMany({ where: { ownerId: userId }, select: { id: true, kind: true, alt: true, variants: true, state: true, createdAt: true } }),
  ]);

  const [reports, appeals, tickets, notifications] = await Promise.all([
    db.report.findMany({ where: { reporterId: userId }, select: { targetType: true, targetId: true, reason: true, details: true, createdAt: true } }),
    db.appeal.findMany({ where: { userId }, select: { caseId: true, statement: true, decision: true, createdAt: true, decidedAt: true } }),
    db.supportTicket.findMany({ where: { userId }, select: { subject: true, body: true, topic: true, status: true, createdAt: true } }),
    db.notification.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" }, take: 1000, select: { type: true, data: true, readAt: true, createdAt: true } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    hinweis: "Datenauskunft von Werkuno. Nicht enthalten: Passwort, Zwei-Faktor-Schlüssel und Zugangstokens (aus Sicherheitsgründen) sowie Inhalte anderer Personen.",
    konto: { user, preference, customerDetails, subscription, sessions, devices, loginProviders: authAccounts },
    inhalte: { posts, coauthorships, projects, contributions, tutorials, tutorialProgress, articles, comments, reactions, pollVotes, media },
    netzwerk: { following: follows, followerCount: followers, blocks, mutes, memberships, eventAttendance, challengeEntries, challengeVotes },
    sammlungen: { bookmarks, collections, shoppingLists, materialStock },
    nachrichten: { messages, conversations },
    marktplatz: { shop, orders, reviews, entitlements },
    verfahren: { reports, appeals, supportTickets: tickets },
    benachrichtigungen: notifications,
  };
}
