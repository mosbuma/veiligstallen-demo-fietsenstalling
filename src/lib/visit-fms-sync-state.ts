import { prisma } from "@/lib/db";
import { getActiveStallingProfileId } from "@/lib/stalling-profile";

export type FmsSyncStatus = "pending" | "synced" | "failed";

/**
 * Re-queue closed visits whose local state changed after the last successful FMS push
 * (e.g. balie synced open check-in, then controle closed with checkouttype controle).
 */
export async function reconcileStaleFmsSyncQueue(stallingProfileId?: string): Promise<number> {
  const profileId = stallingProfileId ?? (await getActiveStallingProfileId());
  const updated = await prisma.$executeRaw`
    UPDATE "Visit"
    SET "fmsSyncStatus" = 'pending',
        "fmsSyncMessage" = 'Opnieuw in wachtrij (lokaal gewijzigd na vorige sync)'
    WHERE "stallingProfileId" = ${profileId}
      AND "fmsSyncStatus" = 'synced'
      AND "status" = 'closed'
      AND ("fmsSyncAt" IS NULL OR "fmsSyncAt" < "updatedAt")
  `;
  return Number(updated);
}

/** Reset when local transaction data changes and must be pushed again. */
export function fmsSyncNeedsResync() {
  return {
    fmsSyncStatus: "pending" as const,
    fmsSyncAt: null,
    fmsSyncMessage: null,
  };
}

/** Update sync outcome without touching Visit.updatedAt (keeps watermark / queue stable). */
export async function markVisitFmsSynced(visitId: string, at: Date, message?: string) {
  await prisma.$executeRaw`
    UPDATE "Visit"
    SET "fmsSyncStatus" = 'synced',
        "fmsSyncAt" = ${at},
        "fmsSyncMessage" = ${message ?? null}
    WHERE id = ${visitId}
  `;
}

export async function markVisitsFmsSynced(visitIds: string[], at: Date, message?: string) {
  if (visitIds.length === 0) return;
  const msg = message ?? null;
  for (const visitId of visitIds) {
    await prisma.$executeRaw`
      UPDATE "Visit"
      SET "fmsSyncStatus" = 'synced',
          "fmsSyncAt" = ${at},
          "fmsSyncMessage" = ${msg}
      WHERE id = ${visitId}
    `;
  }
}

export async function markVisitFmsFailed(visitId: string, at: Date, message: string) {
  await prisma.$executeRaw`
    UPDATE "Visit"
    SET "fmsSyncStatus" = 'failed',
        "fmsSyncAt" = ${at},
        "fmsSyncMessage" = ${message}
    WHERE id = ${visitId}
  `;
}
