import { prisma } from "@/lib/db";
import { activeStallingScope, findBicycleByBarcode } from "@/lib/stalling-scope";
import { controleCheckInUnexpected, controleCheckoutMissing } from "@/lib/visits";
import { fmsSyncNeedsResync } from "@/lib/visit-fms-sync-state";

export type ControleScanResult =
  | { ok: true; effect: "inventory_found"; visitId: string; barcode: string }
  | { ok: true; effect: "already_scanned"; barcode: string }
  | { ok: true; effect: "unexpected_added"; barcode: string }
  | { ok: false; message: string };

const NOT_PHYSICALLY_IN_STALLING =
  "Fiets staat niet fysiek in de stalling (alleen inventaris buiten — niet scannen).";

/** Fysiek in stalling: op vloer of open inventaris met physicallyPresent. */
export function isPhysicallyInStalling(
  bicycle: { floorPresent: boolean } | null | undefined,
  visit: { status: string; physicallyPresent: boolean } | null | undefined
): boolean {
  if (bicycle?.floorPresent) return true;
  if (visit?.status === "open" && visit.physicallyPresent) return true;
  return false;
}

/** Snapshot at controle start: all open stalling-inventaris visit ids. */
export async function controleInventoryVisitIds(): Promise<string[]> {
  const scope = await activeStallingScope();
  const visits = await prisma.visit.findMany({
    where: { ...scope, status: "open", bicycleId: { not: null } },
    select: { id: true },
  });
  return visits.map((v) => v.id);
}

/**
 * Wilmar-style list controle (local DB):
 * - Scan in start-inventaris → mark found (removed from pending client-side).
 * - Scan not in inventaris (e.g. plaats zonder scan) → track as unexpected present.
 */
export async function controleScanBarcode(input: {
  barcode: string;
  pendingVisitIds: string[];
  alreadyScannedBarcodes: string[];
  inventoryVisitIdsAtStart: string[];
}): Promise<ControleScanResult> {
  const bc = input.barcode.trim();
  if (!bc) return { ok: false, message: "Geen barcode" };

  if (input.alreadyScannedBarcodes.includes(bc)) {
    return { ok: true, effect: "already_scanned", barcode: bc };
  }

  const scope = await activeStallingScope();
  const visit = await prisma.visit.findFirst({
    where: { ...scope, status: "open", bicycle: { barcode: bc } },
    include: { bicycle: true },
  });
  const bicycle = visit?.bicycle ?? (await findBicycleByBarcode(bc));

  if (!isPhysicallyInStalling(bicycle, visit)) {
    return { ok: false, message: NOT_PHYSICALLY_IN_STALLING };
  }

  if (visit && input.inventoryVisitIdsAtStart.includes(visit.id)) {
    if (!input.pendingVisitIds.includes(visit.id)) {
      return { ok: true, effect: "already_scanned", barcode: bc };
    }
    await prisma.visit.update({
      where: { id: visit.id },
      data: { physicallyPresent: true },
    });
    if (visit.bicycleId && visit.bicycle) {
      await prisma.bicycle.update({
        where: { id: visit.bicycleId },
        data: {
          floorPresent: true,
          floorSectionId: visit.sectionId,
          floorStallPlace: visit.stallPlace,
          floorPlacementKind: visit.placementKind,
          floorFmsSectionId: visit.fmsSectionId,
        },
      });
    }
    return { ok: true, effect: "inventory_found", visitId: visit.id, barcode: bc };
  }

  if (visit && !input.inventoryVisitIdsAtStart.includes(visit.id)) {
    return { ok: true, effect: "already_scanned", barcode: bc };
  }

  if (!visit && bicycle) {
    return { ok: true, effect: "unexpected_added", barcode: bc };
  }

  if (!bicycle) {
    return { ok: false, message: `Onbekende barcode ${bc} — eerst uitgeven op de balie` };
  }

  return { ok: true, effect: "unexpected_added", barcode: bc };
}

/**
 * End controle: controle-checkout for visits still on the pending list;
 * controle check-in for unexpected scans (Wilmar: sync / controle-in, idcode = barcode when unknown).
 */
export async function finishWilmarControle(input: {
  pendingVisitIds: string[];
  scannedBarcodes: string[];
  unexpectedBarcodes: string[];
}) {
  const errors: string[] = [];
  let checkedOut = 0;
  let checkedIn = 0;

  for (const visitId of input.pendingVisitIds) {
    try {
      const visit = await prisma.visit.findUnique({ where: { id: visitId } });
      if (visit?.status === "open") {
        await controleCheckoutMissing(visitId);
        checkedOut++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Uitcheck ${visitId} mislukt`);
    }
  }

  for (const bc of input.unexpectedBarcodes) {
    if (!input.scannedBarcodes.includes(bc)) continue;
    try {
      const scope = await activeStallingScope();
      const open = await prisma.visit.findFirst({
        where: { ...scope, status: "open", bicycle: { barcode: bc } },
      });
      if (open) continue;

      let bicycle = await findBicycleByBarcode(bc);
      if (!bicycle) {
        errors.push(`Onverwachte scan ${bc}: geen fiets in systeem`);
        continue;
      }

      await controleCheckInUnexpected({
        passCode: bc,
        barcode: bc,
        biketypeId: bicycle.biketypeId,
      });
      checkedIn++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Controle-in ${bc} mislukt`);
    }
  }

  // Touch floor rows so batch occupation sync can pick up controle scans (no direct FMS).
  const scope = await activeStallingScope();
  await prisma.bicycle.updateMany({
    where: { ...scope, floorPresent: true },
    data: { updatedAt: new Date() },
  });

  return {
    ok: errors.length === 0,
    checkedOut,
    checkedIn,
    scannedPresent: input.scannedBarcodes.length,
    errors,
    localOnly: true as const,
  };
}
