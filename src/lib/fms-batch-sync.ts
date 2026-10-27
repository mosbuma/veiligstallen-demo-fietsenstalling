import { prisma } from "@/lib/db";
import {
  credentialsFromSettings,
  postManagedTransaction,
  postSaldo,
  postSaveBike,
} from "@/lib/fms/client";
import { getMetadataBundle, parseSections } from "@/lib/fms/metadata-cache";
import { fmsSectionIdForVisit } from "@/lib/parking";
import { fmsSectionForFloor, postFloorOccupation } from "@/lib/real-world";
import { appNow, getSettings } from "@/lib/settings";

async function lastFmsBatchAt(): Promise<Date> {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return row?.lastFmsBatchAt ?? new Date(0);
}

/** Visits (transactions) changed locally since the last successful VeiligStallen batch. */
export async function countVisitsPendingFmsSync(): Promise<number> {
  const since = await lastFmsBatchAt();
  return prisma.visit.count({ where: { updatedAt: { gt: since } } });
}

export async function countFloorPendingFmsSync(): Promise<number> {
  const since = await lastFmsBatchAt();
  return prisma.bicycle.count({ where: { updatedAt: { gt: since } } });
}

export async function listVisitsPendingFmsSync() {
  const since = await lastFmsBatchAt();
  const visits = await prisma.visit.findMany({
    where: { updatedAt: { gt: since } },
    include: { bicycle: { select: { barcode: true } } },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });
  return visits.map((v) => ({
    id: v.id,
    externalTransactionId: v.externalTransactionId,
    status: v.status,
    idcode: v.idcode,
    barcode: v.bicycle?.barcode ?? "",
    checkInDate: v.checkInDate.toISOString(),
    checkOutDate: v.checkOutDate?.toISOString() ?? null,
    checkInType: v.checkInType,
    checkOutType: v.checkOutType,
    sectionId: v.sectionId,
    stallPlace: v.stallPlace,
    stallingskosten: v.stallingskosten != null ? Number(v.stallingskosten) : null,
    paymentMethod: v.paymentMethod,
    updatedAt: v.updatedAt.toISOString(),
  }));
}

export async function getFmsBatchStatus() {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const [pendingTransactions, pendingFloorChanges, pendingVisits] = await Promise.all([
    countVisitsPendingFmsSync(),
    countFloorPendingFmsSync(),
    listVisitsPendingFmsSync(),
  ]);
  return {
    pendingTransactions,
    pendingFloorChanges,
    pendingVisits,
    lastFmsBatchAt: row?.lastFmsBatchAt?.toISOString() ?? null,
    lastFmsBatchOk: row?.lastFmsBatchOk ?? null,
    lastFmsBatchMessage: row?.lastFmsBatchMessage ?? "",
  };
}

export async function runVeiligstallenBatchSync(): Promise<{
  ok: boolean;
  message: string;
  syncedVisits: number;
  errors: string[];
}> {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const now = appNow(settings);
  const since = await lastFmsBatchAt();
  const errors: string[] = [];
  let syncedVisits = 0;

  const pendingVisits = await prisma.visit.findMany({
    where: { updatedAt: { gt: since } },
    include: { bicycle: true },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  const floorChanged = await prisma.bicycle.count({
    where: { updatedAt: { gt: since } },
  });

  for (const visit of pendingVisits) {
    const fmsSection = fmsSectionIdForVisit(visit);
    if (!fmsSection) {
      errors.push(`Bezoek ${visit.id}: geen FMS-sector`);
      continue;
    }
    const barcode = visit.bicycle?.barcode ?? "";
    try {
      await postSaveBike(
        creds,
        settings.citycode,
        settings.locationId,
        visit.idType,
        visit.idcode,
        { bikeid: barcode, biketypeid: visit.biketypeId },
        visit.id
      );

      const managed: Record<string, unknown> = {
        externaltransactionid: visit.externalTransactionId,
        idcode: visit.idcode,
        idtype: visit.idType,
        checkindate: visit.checkInDate.toISOString(),
        checkintype: visit.checkInType,
        bikeid_in: barcode,
        biketypeid: visit.biketypeId,
        sectionid: fmsSection,
      };

      if (visit.status === "closed" && visit.checkOutDate) {
        managed.checkoutdate = visit.checkOutDate.toISOString();
        managed.checkouttype = visit.checkOutType ?? "user";
        managed.stallingsduur = visit.stallingsduur ?? 0;
        managed.stallingskosten = visit.stallingskosten != null ? Number(visit.stallingskosten) : 0;
        managed.bikeid_out = barcode;

        if (
          visit.paymentMethod === "saldo" &&
          visit.stallingskosten != null &&
          Number(visit.stallingskosten) > 0 &&
          !visit.subscriptionWaived
        ) {
          const saldo = await postSaldo(
            creds,
            settings.citycode,
            settings.locationId,
            visit.idType,
            visit.idcode,
            {
              amount: -Number(visit.stallingskosten),
              paymenttypeid: 1,
              transactiondate: visit.checkOutDate.toISOString(),
            },
            visit.id
          );
          if (!saldo.ok) errors.push(`Saldo ${visit.idcode}: HTTP ${saldo.status}`);
        }
      }

      const mt = await postManagedTransaction(
        creds,
        settings.citycode,
        settings.locationId,
        fmsSection,
        managed,
        visit.id
      );
      if (!mt.ok) {
        errors.push(`MT ${visit.externalTransactionId}: HTTP ${mt.status}`);
        continue;
      }
      syncedVisits++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Bezoek ${visit.id} mislukt`);
    }
  }

  if (pendingVisits.length > 0 || floorChanged > 0) {
    try {
      const bundle = await getMetadataBundle();
      const sections = parseSections(bundle.sections.json);
      const sectionIds = new Set<string>();
      for (const s of sections) {
        const id = String(s.sectionid ?? s.id ?? "").trim();
        if (id) sectionIds.add(id);
      }
      const onFloor = await prisma.bicycle.findMany({
        where: { floorPresent: true },
        select: {
          floorPresent: true,
          floorFmsSectionId: true,
          floorSectionId: true,
          floorStallPlace: true,
          floorPlacementKind: true,
        },
      });
      for (const b of onFloor) {
        const sid = fmsSectionForFloor(b);
        if (sid) sectionIds.add(sid);
      }
      for (const sectionId of sectionIds) {
        await postFloorOccupation(sectionId);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Occupation sync mislukt");
    }
  }

  const ok = errors.length === 0;
  const message =
    errors.length === 0
      ? `VeiligStallen bijgewerkt (${syncedVisits} transacties, bezetting).`
      : `Deels gelukt (${syncedVisits} transacties). ${errors.slice(0, 3).join(" · ")}`;

  if (ok) {
    await prisma.appSettings.update({
      where: { id: "default" },
      data: {
        lastFmsBatchAt: now,
        lastFmsBatchOk: true,
        lastFmsBatchMessage: message,
      },
    });
  } else {
    await prisma.appSettings.update({
      where: { id: "default" },
      data: {
        lastFmsBatchOk: false,
        lastFmsBatchMessage: message,
      },
    });
  }

  return { ok, message, syncedVisits, errors };
}
