import { prisma } from "@/lib/db";
import { fmsBalanceForIdcode } from "@/lib/fms/balance-read";
import { getProtectedReadsCached } from "@/lib/fms/metadata-cache";
import { passHasActiveSubscription } from "@/lib/subscription-active";
import { countFloorAssigned, countFloorVirtual } from "@/lib/real-world";
import { assignParking, fmsSectionIdForVisit, OTHER_SECTION_ID, type ParkingAssignment } from "@/lib/parking";
import { resolvePassForCheckIn } from "@/lib/pass-checkin";
import { appNow, getSettings } from "@/lib/settings";
import {
  activeStallingScope,
  findBicycleByBarcode,
} from "@/lib/stalling-scope";
import { fmsSyncNeedsResync } from "@/lib/visit-fms-sync-state";
import { displayPassCode, isSyntheticPassCode, visitKnownAtBalie } from "@/lib/pass-display";
import { calculateTransactionCost, stallingsduurMinutes } from "@/lib/tariff";
import { Decimal } from "@prisma/client/runtime/library";

export function generateExternalTransactionId(): string {
  return `DEMO-MT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type CheckType = "user" | "controle" | "system";

export { visitKnownAtBalie } from "@/lib/pass-display";

/** @deprecated use countFloorAssigned from real-world */
export async function countOpenVisits(): Promise<number> {
  return countFloorAssigned();
}

/** @deprecated use countFloorVirtual from real-world */
export async function countVirtualOpenVisits(): Promise<number> {
  return countFloorVirtual();
}

function parkingToVisitFields(p: ParkingAssignment) {
  return {
    sectionId: p.sectionId,
    stallPlace: p.stallPlace,
    placementKind: p.placementKind,
    fmsSectionId: p.fmsSectionId,
    physicallyPresent: true,
  };
}

function parkingToBicycleFloor(p: ParkingAssignment) {
  return {
    floorPresent: true,
    floorSectionId: p.sectionId,
    floorStallPlace: p.stallPlace,
    floorPlacementKind: p.placementKind,
    floorFmsSectionId: p.fmsSectionId,
  };
}

export async function checkIn(input: {
  passCode: string;
  barcode: string;
  biketypeId: number;
  idType?: number;
  checkInType?: CheckType;
}) {
  const settings = await getSettings();
  const now = appNow(settings);
  const externalTransactionId = generateExternalTransactionId();
  const checkInType = input.checkInType ?? "user";
  const passCode = input.passCode.trim();
  const barcode = input.barcode.trim();

  const scope = await activeStallingScope();
  let bicycle = await findBicycleByBarcode(barcode);

  const openVisitBefore = bicycle
    ? await prisma.visit.findFirst({
        where: { ...scope, bicycleId: bicycle.id, status: "open" },
      })
    : null;

  if (
    openVisitBefore &&
    visitKnownAtBalie(openVisitBefore) &&
    openVisitBefore.physicallyPresent &&
    bicycle?.floorPresent
  ) {
    throw new Error(
      `Fietssticker ${barcode} staat al op de stalling (sleutelhanger ${displayPassCode(openVisitBefore.idcode)}). Eerst uitchecken of verwijderen zonder scan.`
    );
  }

  let parking: ParkingAssignment;
  if (bicycle?.floorPresent && !openVisitBefore) {
    parking = {
      placementKind: bicycle.floorPlacementKind as "assigned" | "other",
      sectionId: bicycle.floorSectionId,
      stallPlace: bicycle.floorStallPlace,
      fmsSectionId: bicycle.floorFmsSectionId,
    };
  } else {
    parking = await assignParking(input.biketypeId, {
      excludeVisitId: openVisitBefore?.id,
      excludeBicycleId: bicycle?.id,
    });
  }

  if (!parking.fmsSectionId) {
    throw new Error("Geen FMS-sector beschikbaar (metadata secties leeg?)");
  }

  const visit = await prisma.$transaction(async (tx) => {
    const resolved = await resolvePassForCheckIn(tx, settings, {
      passCode,
      barcode,
      checkInType,
      idType: input.idType,
    });

    if (!isSyntheticPassCode(resolved.idcode)) {
      const otherOnPass = await tx.visit.findFirst({
        where: {
          ...scope,
          status: "open",
          idcode: resolved.idcode,
          ...(bicycle ? { NOT: { bicycleId: bicycle.id } } : {}),
        },
        include: { bicycle: { select: { barcode: true } } },
      });
      if (otherOnPass) {
        const otherBc = otherOnPass.bicycle?.barcode ?? "—";
        throw new Error(
          `Sleutelhanger ${resolved.idcode} staat al in de stalling (fietssticker ${otherBc}). Eerst uitchecken.`
        );
      }
    }

    if (!bicycle) {
      bicycle = await tx.bicycle.create({
        data: {
          stallingProfileId: settings.stallingProfileId,
          barcode,
          biketypeId: input.biketypeId,
          passId: resolved.passId,
        },
      });
    } else {
      if (resolved.passId && !bicycle.passId) {
        bicycle = await tx.bicycle.update({
          where: { id: bicycle.id },
          data: { passId: resolved.passId },
        });
      }
      bicycle = await tx.bicycle.update({
        where: { id: bicycle.id },
        data: parkingToBicycleFloor(parking),
      });
    }

    const openVisit = await tx.visit.findFirst({
      where: { ...scope, bicycleId: bicycle!.id, status: "open" },
    });

    if (openVisit) {
      return tx.visit.update({
        where: { id: openVisit.id },
        data: {
          ...parkingToVisitFields(parking),
          ...fmsSyncNeedsResync(),
          idcode: resolved.idcode,
          inventoryBarcode: barcode,
          passId: resolved.passId,
          biketypeId: input.biketypeId,
          idType: resolved.idType,
          checkInType,
        },
      });
    }

    return tx.visit.create({
      data: {
        stallingProfileId: settings.stallingProfileId,
        externalTransactionId,
        passId: resolved.passId,
        bicycleId: bicycle!.id,
        ...parkingToVisitFields(parking),
        idcode: resolved.idcode,
        inventoryBarcode: barcode,
        idType: resolved.idType,
        biketypeId: input.biketypeId,
        checkInDate: now,
        checkInType,
        status: "open",
        ...fmsSyncNeedsResync(),
      },
    });
  });

  return { visit, parking, localOnly: true as const };
}

async function subscriptionCoversPass(
  passCode: string,
  biketypeId: number
): Promise<boolean> {
  try {
    const cached = await getProtectedReadsCached();
    if (!cached) return false;
    return passHasActiveSubscription(passCode, cached.subscriptions);
  } catch {
    return false;
  }
  void biketypeId;
  return false;
}

export async function checkOut(input: {
  visitId: string;
  paymentMethod: "saldo" | "cash" | "pin";
  checkOutType?: CheckType;
}) {
  const settings = await getSettings();
  const now = appNow(settings);

  const visit = await prisma.visit.findUnique({
    where: { id: input.visitId },
    include: { bicycle: true, pass: true },
  });
  if (!visit || visit.status !== "open" || visit.stallingProfileId !== settings.stallingProfileId) {
    throw new Error("Geen open bezoek gevonden");
  }
  const fmsSection = fmsSectionIdForVisit(visit);
  if (!fmsSection) {
    throw new Error("Geen sector/plaats op bezoek — lokaal uitchecken niet mogelijk");
  }

  const duur = stallingsduurMinutes(visit.checkInDate, now);
  let kosten = calculateTransactionCost(duur, settings.tariffSteps);
  let waived = false;
  if (await subscriptionCoversPass(visit.idcode, visit.biketypeId)) {
    kosten = 0;
    waived = true;
  }

  if (!waived && input.paymentMethod === "saldo" && kosten > 0) {
    const cached = await getProtectedReadsCached();
    if (cached?.balances) {
      const bal = fmsBalanceForIdcode(cached.balances, visit.idcode);
      if (bal != null && bal + 1e-6 < kosten) {
        throw new Error(
          `Onvoldoende stallingstegoed voor ${visit.idcode}: ${bal.toFixed(2)} EUR, kosten ${kosten.toFixed(2)} EUR (cache). Vernieuw saldi op Aansluiten of kies contant/pin.`
        );
      }
    }
  }

  const bicycleId = visit.bicycleId ?? visit.bicycle?.id ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.visit.update({
      where: { id: visit.id },
      data: {
        ...fmsSyncNeedsResync(),
        checkOutDate: now,
        checkOutType: input.checkOutType ?? "user",
        stallingsduur: duur,
        stallingskosten: new Decimal(kosten),
        paymentMethod: waived ? "subscription" : input.paymentMethod,
        subscriptionWaived: waived,
        status: "closed",
        physicallyPresent: false,
        inventoryBarcode: null,
      },
    });
    if (bicycleId) {
      await tx.bicycle.update({
        where: { id: bicycleId },
        data: {
          floorPresent: false,
          floorSectionId: "",
          floorStallPlace: "",
          floorPlacementKind: "assigned",
          floorFmsSectionId: "",
        },
      });
    }
    return closed;
  });

  return { visit: updated, localOnly: true as const };
}

/** Controle-uit: inventaris sluiten; fysieke fiets op vloer blijft staan (Wilmar ontbrekende scan). */
export async function controleCheckoutMissing(visitId: string) {
  const settings = await getSettings();
  const now = appNow(settings);

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { bicycle: true },
  });
  if (!visit || visit.status !== "open" || visit.stallingProfileId !== settings.stallingProfileId) {
    throw new Error("Geen open bezoek gevonden");
  }

  const duur = stallingsduurMinutes(visit.checkInDate, now);
  let kosten = calculateTransactionCost(duur, settings.tariffSteps);
  let waived = false;
  if (await subscriptionCoversPass(visit.idcode, visit.biketypeId)) {
    kosten = 0;
    waived = true;
  }

  const bicycle = visit.bicycle;
  const floorKeep =
    bicycle && bicycle.floorPresent
      ? {
          floorPresent: true as const,
          floorSectionId: bicycle.floorSectionId,
          floorStallPlace: bicycle.floorStallPlace,
          floorPlacementKind: bicycle.floorPlacementKind,
          floorFmsSectionId: bicycle.floorFmsSectionId,
        }
      : bicycle && visit.physicallyPresent
        ? {
            floorPresent: true as const,
            floorSectionId: visit.sectionId,
            floorStallPlace: visit.stallPlace,
            floorPlacementKind: visit.placementKind,
            floorFmsSectionId: visit.fmsSectionId,
          }
        : null;

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.visit.update({
      where: { id: visit.id },
      data: {
        ...fmsSyncNeedsResync(),
        checkOutDate: now,
        checkOutType: "controle",
        stallingsduur: duur,
        stallingskosten: new Decimal(kosten),
        // Wilmar/stallingsbeheer: MT with costs; tegoed via addJsonSaldo (no contant/pin correction at controle).
        paymentMethod: waived ? "subscription" : kosten > 0 ? "saldo" : "cash",
        subscriptionWaived: waived,
        status: "closed",
        physicallyPresent: false,
        inventoryBarcode: null,
      },
    });
    if (visit.bicycleId && floorKeep) {
      await tx.bicycle.update({
        where: { id: visit.bicycleId },
        data: floorKeep,
      });
    }
    return closed;
  });

  return { visit: updated, localOnly: true as const };
}

export async function controleCheckInUnexpected(input: {
  passCode: string;
  barcode: string;
  biketypeId: number;
  idType?: number;
}) {
  return checkIn({
    passCode: input.passCode,
    barcode: input.barcode,
    biketypeId: input.biketypeId,
    idType: input.idType,
    checkInType: "controle",
  });
}

export { syncOccupationInventory } from "@/lib/fms/occupation-inventory-sync";
export { OTHER_SECTION_ID };
