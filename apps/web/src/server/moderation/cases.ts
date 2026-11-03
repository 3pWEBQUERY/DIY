import "server-only";
import { db, type TargetType } from "@/server/db";
import { emit } from "@/server/events";

/** Automatische Risikoeinstufung zur Priorisierung (§24.1 Nr. 4) – ersetzt keine menschliche Prüfung. */
const REASON_WEIGHT: Record<string, number> = {
  DANGEROUS: 40,
  SCAM: 35,
  HATE: 35,
  HARASSMENT: 30,
  PROHIBITED_ITEM: 30,
  NUDITY: 25,
  COPYRIGHT: 20,
  MISINFORMATION: 15,
  SPAM: 10,
  OTHER: 5,
};

export function riskScore(reason: string, reportCount: number, targetType: TargetType) {
  const typeBoost = targetType === "PRODUCT" || targetType === "MESSAGE" ? 10 : targetType === "TUTORIAL" || targetType === "TUTORIAL_STEP" ? 8 : 0;
  return Math.min(100, (REASON_WEIGHT[reason] ?? 5) + typeBoost + Math.min(40, (reportCount - 1) * 8));
}

export async function openOrAttachCase(input: {
  reporterId: string;
  targetType: TargetType;
  targetId: string;
  reason: string;
  details: string;
  subjectUserId: string | null;
  snapshot: Record<string, unknown>;
}) {
  return db.$transaction(async (tx) => {
    let c = await tx.moderationCase.findFirst({
      where: { targetType: input.targetType, targetId: input.targetId, status: { in: ["OPEN", "IN_REVIEW"] } },
    });
    if (c) {
      const count = c.reportCount + 1;
      c = await tx.moderationCase.update({
        where: { id: c.id },
        data: { reportCount: count, riskScore: Math.max(c.riskScore, riskScore(input.reason, count, input.targetType)) },
      });
    } else {
      c = await tx.moderationCase.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          subjectUserId: input.subjectUserId,
          primaryReason: input.reason,
          riskScore: riskScore(input.reason, 1, input.targetType),
          snapshot: input.snapshot as object,
        },
      });
      await emit({ type: "ReportCreated", caseId: c.id }, tx);
    }
    await tx.report.create({
      data: { reporterId: input.reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details, caseId: c.id },
    });
    return c;
  });
}
