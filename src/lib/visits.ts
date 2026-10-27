import { prisma } from "@/lib/db";
import { getProtectedReads } from "@/lib/fms/metadata-cache";
import { countFloorAssigned, countFloorVirtual } from "@/lib/real-world";
import { assignParking, fmsSectionIdForVisit, OTHER_SECTION_ID, type ParkingAssignment } from "@/lib/parking";
import { appNow, getSettings } from "@/lib/settings";
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

  let pass = await prisma.pass.findUnique({ where: { passCode: input.passCode } });
  if (!pass) {
    pass = await prisma.pass.create({
      data: {
        passCode: input.passCode,
        idType: input.idType ?? settings.defaultIdType,
      },
    });
  }

  let bicycle = await prisma.bicycle.findUnique({ where: { barcode: input.barcode } });
  if (!bicycle) {
    bicycle = await prisma.bicycle.create({
      data: {
        barcode: input.barcode,
        biketypeId: input.biketypeId,
        passId: pass.id,
      },
    });
  } else if (!bicycle.passId) {
    bicycle = await prisma.bicycle.update({
      where: { id: bicycle.id },
      data: { passId: pass.id },
    });
  }

  if (!isSyntheticPassCode(input.passCode)) {
    const otherOnPass = await prisma.visit.findFirst({
      where: {
        status: "open",
        idcode: input.passCode,
        NOT: { bicycleId: bicycle.id },
      },
      include: { bicycle: { select: { barcode: true } } },
    });
    if (otherOnPass) {
      const otherBc = otherOnPass.bicycle?.barcode ?? "—";
      throw new Error(
        `Pas ${input.passCode} staat al in de stalling (barcode ${otherBc}). Eerst uitchecken.`
      );
    }
  }

  const openVisit = await prisma.visit.findFirst({
    where: { bicycleId: bicycle.id, status: "open" },
  });

  if (
    openVisit &&
    visitKnownAtBalie(openVisit) &&
    openVisit.physicallyPresent &&
    bicycle.floorPresent
  ) {
    throw new Error(
      `Barcode ${input.barcode} staat al op de stalling (pas ${displayPassCode(openVisit.idcode)}). Eerst uitchecken of verwijderen zonder scan.`
    );
  }

  let parking: ParkingAssignment;
  if (bicycle.floorPresent && !openVisit) {
    parking = {
      placementKind: bicycle.floorPlacementKind as "assigned" | "other",
      sectionId: bicycle.floorSectionId,
      stallPlace: bicycle.floorStallPlace,
      fmsSectionId: bicycle.floorFmsSectionId,
    };
  } else {
    parking = await assignParking(input.biketypeId, {
      excludeVisitId: openVisit?.id,
      excludeBicycleId: bicycle.id,
    });
  }

  await prisma.bicycle.update({
    where: { id: bicycle.id },
    data: parkingToBicycleFloor(parking),
  });

  let visit;
  if (openVisit) {
    visit = await prisma.visit.update({
      where: { id: openVisit.id },
      data: {
        ...parkingToVisitFields(parking),
        idcode: input.passCode,
        passId: pass.id,
        biketypeId: input.biketypeId,
        idType: input.idType ?? pass.idType,
        checkInType: input.checkInType ?? "user",
      },
    });
  } else {
    visit = await prisma.visit.create({
      data: {
        externalTransactionId,
        passId: pass.id,
        bicycleId: bicycle.id,
        ...parkingToVisitFields(parking),
        idcode: input.passCode,
        idType: input.idType ?? pass.idType,
        biketypeId: input.biketypeId,
        checkInDate: now,
        checkInType: input.checkInType ?? "user",
        status: "open",
      },
    });
  }

  if (!parking.fmsSectionId) {
    throw new Error("Geen FMS-sector beschikbaar (metadata secties leeg?)");
  }

  return { visit, parking, localOnly: true as const };
}

async function subscriptionCoversPass(
  passCode: string,
  biketypeId: number
): Promise<boolean> {
  try {
    const { subscriptions } = await getProtectedReads();
    if (!Array.isArray(subscriptions)) return false;
    for (const sub of subscriptions) {
      const row = sub as Record<string, unknown>;
      if (String(row.idcode ?? "") !== passCode) continue;
      const exp = row.expirationdate ? new Date(String(row.expirationdate)) : null;
      if (exp && exp < new Date()) continue;
      return true;
    }
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
  if (!visit || visit.status !== "open") {
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

  const bicycleId = visit.bicycleId ?? visit.bicycle?.id ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.visit.update({
      where: { id: visit.id },
      data: {
        checkOutDate: now,
        checkOutType: input.checkOutType ?? "user",
        stallingsduur: duur,
        stallingskosten: new Decimal(kosten),
        paymentMethod: waived ? "subscription" : input.paymentMethod,
        subscriptionWaived: waived,
        status: "closed",
        physicallyPresent: false,
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
  if (!visit || visit.status !== "open") {
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
        checkOutDate: now,
        checkOutType: "controle",
        stallingsduur: duur,
        stallingskosten: new Decimal(kosten),
        paymentMethod: waived ? "subscription" : "cash",
        subscriptionWaived: waived,
        status: "closed",
        physicallyPresent: false,
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
}) {
  return checkIn({
    passCode: input.passCode,
    barcode: input.barcode,
    biketypeId: input.biketypeId,
    checkInType: "controle",
  });
}

export async function syncOccupationInventory(
  sectionId: string,
  bikes: Array<{ idcode: string; idtype: number; bikeid: string }>
) {
  void sectionId;
  void bikes;
  await prisma.bicycle.updateMany({ data: { updatedAt: new Date() } });
  return { ok: true, status: 200, localOnly: true as const };
}

export { OTHER_SECTION_ID };
