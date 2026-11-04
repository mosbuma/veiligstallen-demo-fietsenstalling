import { prisma } from "@/lib/db";
import { isSyntheticPassCode } from "@/lib/pass-display";
import { activeStallingScope } from "@/lib/stalling-scope";

function mapBicycleRow(b: {
  id: string;
  barcode: string;
  biketypeId: number;
  createdAt: Date;
  floorPresent: boolean;
  floorSectionId: string;
  floorStallPlace: string;
  floorPlacementKind: string;
  pass: { passCode: string } | null;
}) {
  return {
    id: b.id,
    barcode: b.barcode,
    biketypeId: b.biketypeId,
    createdAt: b.createdAt,
    floorPresent: b.floorPresent,
    floorSectionId: b.floorSectionId,
    floorStallPlace: b.floorStallPlace,
    floorPlacementKind: b.floorPlacementKind,
    passCode: (() => {
      const raw = b.pass?.passCode ?? null;
      return raw && !isSyntheticPassCode(raw) ? raw : null;
    })(),
  };
}

/** Buiten: not on stalling floor; includes inventaris zonder fysieke aanwezigheid. */
export async function listBuitenBicycles() {
  const scope = await activeStallingScope();
  const [bicycles, openVisits] = await Promise.all([
    prisma.bicycle.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      include: { pass: { select: { passCode: true } } },
    }),
    prisma.visit.findMany({
      where: { ...scope, status: "open", bicycleId: { not: null } },
      select: { id: true, bicycleId: true, physicallyPresent: true, idcode: true },
    }),
  ]);

  const openByBike = new Map<
    string,
    { id: string; physicallyPresent: boolean; idcode: string }
  >();
  for (const v of openVisits) {
    if (v.bicycleId) {
      openByBike.set(v.bicycleId, {
        id: v.id,
        physicallyPresent: v.physicallyPresent,
        idcode: v.idcode,
      });
    }
  }

  return bicycles
    .filter((b) => {
      if (b.floorPresent) return false;
      const open = openByBike.get(b.id);
      if (!open) return true;
      return !open.physicallyPresent;
    })
    .map((b) => {
      const open = openByBike.get(b.id);
      const row = mapBicycleRow(b);
      if (open && !open.physicallyPresent) {
        return { ...row, openVisitId: open.id, visitIdcode: open.idcode };
      }
      return row;
    });
}

/** Binnen op vloer zonder open stalling-inventaris (plaats zonder scan). */
export async function listStallingFloorOnlyBicycles() {
  const scope = await activeStallingScope();
  const [bicycles, openVisits] = await Promise.all([
    prisma.bicycle.findMany({
      where: { ...scope, floorPresent: true },
      orderBy: [{ floorSectionId: "asc" }, { floorStallPlace: "asc" }],
      include: { pass: { select: { passCode: true } } },
    }),
    prisma.visit.findMany({
      where: { ...scope, status: "open", bicycleId: { not: null } },
      select: { bicycleId: true },
    }),
  ]);

  const openBikeIds = new Set(openVisits.map((v) => v.bicycleId!));

  return bicycles.filter((b) => !openBikeIds.has(b.id)).map(mapBicycleRow);
}

/** @deprecated use listBuitenBicycles */
export async function listRealWorldBicycles() {
  return listBuitenBicycles();
}

export async function bicycleParkedMap(): Promise<Map<string, boolean>> {
  const scope = await activeStallingScope();
  const [openVisits, floorOnly] = await Promise.all([
    prisma.visit.findMany({
      where: { ...scope, status: "open", bicycleId: { not: null }, physicallyPresent: true },
      select: { bicycleId: true },
    }),
    prisma.bicycle.findMany({
      where: { ...scope, floorPresent: true },
      select: { id: true },
    }),
  ]);
  const map = new Map<string, boolean>();
  for (const v of openVisits) {
    if (v.bicycleId) map.set(v.bicycleId, true);
  }
  for (const b of floorOnly) {
    map.set(b.id, true);
  }
  return map;
}

/** @deprecated use listBuitenBicycles */
export async function listUnparkedBicycles() {
  return listBuitenBicycles();
}
