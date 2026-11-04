import { prisma } from "@/lib/db";

export type FmsSyncStatus = "pending" | "synced" | "failed";

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
