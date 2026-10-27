import { prisma } from "@/lib/db";
import { credentialsFromSettings, postOccupation } from "@/lib/fms/client";
import { assignParking, OTHER_SECTION_ID } from "@/lib/parking";
import { appNow, getSettings } from "@/lib/settings";

export type FloorState = {
  floorPresent: boolean;
  floorSectionId: string;
  floorStallPlace: string;
  floorPlacementKind: string;
  floorFmsSectionId: string;
};

export function fmsSectionForFloor(b: FloorState): string {
  const fms = b.floorFmsSectionId?.trim();
  if (fms) return fms;
  if (b.floorSectionId === OTHER_SECTION_ID) return "";
  return b.floorSectionId;
}

/** Lumiguide: assigned slots occupied in the real world (any cause). */
export async function countFloorAssigned(): Promise<number> {
  return prisma.bicycle.count({
    where: { floorPresent: true, floorPlacementKind: "assigned" },
  });
}

export async function countFloorVirtual(): Promise<number> {
  return prisma.bicycle.count({
    where: { floorPresent: true, floorPlacementKind: "other" },
  });
}

export async function postFloorOccupation(fmsSectionId: string, logRef?: string) {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const now = appNow(settings);
  if (!fmsSectionId) return;
  if (settings.occupationMode !== "direct" && settings.occupationMode !== "both") return;
  const [occupation, virtualOccupation] = await Promise.all([
    countFloorAssigned(),
    countFloorVirtual(),
  ]);
  await postOccupation(
    creds,
    settings.citycode,
    settings.locationId,
    fmsSectionId,
    {
      occupation,
      virtualOccupation,
      transactiondate: now.toISOString(),
      checkins: 0,
      checkouts: 0,
      source: "Lumiguide",
    },
    logRef
  );
}

function parkingToFloor(p: Awaited<ReturnType<typeof assignParking>>) {
  return {
    floorPresent: true,
    floorSectionId: p.sectionId,
    floorStallPlace: p.stallPlace,
    floorPlacementKind: p.placementKind,
    floorFmsSectionId: p.fmsSectionId,
  };
}

export async function clearBicycleFloor(bicycleId: string) {
  return prisma.bicycle.update({
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

/** Plaats zonder scan: fysieke plek; open inventaris (buiten, niet op vloer) wordt mee bijgewerkt. */
export async function placeOnFloorWithoutScan(input: { barcode: string; biketypeId: number }) {
  let bicycle = await prisma.bicycle.findUnique({ where: { barcode: input.barcode } });
  if (!bicycle) {
    bicycle = await prisma.bicycle.create({
      data: { barcode: input.barcode, biketypeId: input.biketypeId },
    });
  } else if (bicycle.floorPresent) {
    throw new Error(`Barcode ${input.barcode} staat al op een plek (echte wereld). Eerst verwijderen zonder scan.`);
  }

  const openVisit = await prisma.visit.findFirst({
    where: { bicycleId: bicycle.id, status: "open" },
  });

  const parking = await assignParking(input.biketypeId, {
    excludeVisitId: openVisit?.id,
    excludeBicycleId: bicycle.id,
  });

  const updated = await prisma.bicycle.update({
    where: { id: bicycle.id },
    data: parkingToFloor(parking),
  });

  if (openVisit) {
    await prisma.visit.update({
      where: { id: openVisit.id },
      data: {
        sectionId: parking.sectionId,
        stallPlace: parking.stallPlace,
        placementKind: parking.placementKind,
        fmsSectionId: parking.fmsSectionId,
        physicallyPresent: true,
        biketypeId: input.biketypeId,
      },
    });
  }

  return { bicycle: updated, parking };
}

/** Verwijder zonder scan: clears physical floor; open inventaris blijft (niet fysiek aanwezig). */
export async function removeFromFloorWithoutScan(input: { barcode?: string; visitId?: string }) {
  let bicycle = null as Awaited<ReturnType<typeof prisma.bicycle.findUnique>>;

  if (input.visitId) {
    const visit = await prisma.visit.findUnique({
      where: { id: input.visitId },
      include: { bicycle: true },
    });
    if (!visit?.bicycle) throw new Error("Geen fiets bij dit bezoek");
    bicycle = visit.bicycle;
  } else if (input.barcode) {
    bicycle = await prisma.bicycle.findUnique({ where: { barcode: input.barcode } });
  }
  if (!bicycle) throw new Error("Geen fiets gevonden");
  if (!bicycle.floorPresent) throw new Error("Fiets staat niet op de stallingvloer (echte wereld)");

  const prevSection = fmsSectionForFloor(bicycle);
  await clearBicycleFloor(bicycle.id);

  const openVisit = await prisma.visit.findFirst({
    where: { bicycleId: bicycle.id, status: "open" },
  });
  if (openVisit) {
    await prisma.visit.update({
      where: { id: openVisit.id },
      data: { physicallyPresent: false },
    });
  }

  return { bicycle: await prisma.bicycle.findUnique({ where: { id: bicycle.id } }) };
}
