import { displayPassCode } from "@/lib/pass-display";

/** Shared stalling list types (balie + controle). */

export type StallingVisit = {
  id: string;
  sectionId: string;
  stallPlace: string;
  physicallyPresent: boolean;
  placementKind: string;
  idcode: string;
  inventoryBarcode?: string | null;
  biketypeId: number;
  bicycle?: { barcode: string | null };
};

/** Barcode shown in inventaris: explicit visit link, else fiets-record. */
export function inventarisBarcode(v: {
  inventoryBarcode?: string | null;
  bicycle?: { barcode: string | null } | null;
}): string {
  return v.inventoryBarcode?.trim() || v.bicycle?.barcode?.trim() || "";
}

export type StallingFloorBike = {
  id: string;
  barcode: string;
  biketypeId: number;
  floorSectionId?: string;
  floorStallPlace?: string;
  floorPlacementKind?: string;
  passCode?: string | null;
};

export type StallingRow =
  | { kind: "visit"; barcode: string; visit: StallingVisit }
  | { kind: "floor"; barcode: string; bike: StallingFloorBike };

/** Passes shown in stalling inventaris (open visit idcode); floor-only rows have no pas. */
export function passCodesInUseFromStallingInventory(
  openVisits: Pick<StallingVisit, "idcode">[]
): string[] {
  const codes: string[] = [];
  for (const v of openVisits) {
    if (displayPassCode(v.idcode) === "—") continue;
    codes.push(v.idcode);
  }
  return codes;
}

export function buildStallingRows(
  openVisits: StallingVisit[],
  floorOnly: StallingFloorBike[]
): StallingRow[] {
  const rows: StallingRow[] = [];
  for (const v of openVisits) {
    rows.push({ kind: "visit", barcode: inventarisBarcode(v), visit: v });
  }
  for (const b of floorOnly) {
    rows.push({ kind: "floor", barcode: b.barcode, bike: b });
  }
  rows.sort((a, b) => a.barcode.localeCompare(b.barcode, undefined, { numeric: true }));
  return rows;
}

export function sectorPlaatsForVisit(v: StallingVisit) {
  if (!v.physicallyPresent) return { sector: "—", place: "—" };
  if (v.placementKind === "other") return { sector: "Overig", place: "—" };
  return {
    sector: v.sectionId || "—",
    place: v.stallPlace || "—",
  };
}

export function sectorPlaatsForFloor(b: StallingFloorBike) {
  if (b.floorPlacementKind === "other") return { sector: "Overig", place: "—" };
  return {
    sector: b.floorSectionId || "—",
    place: b.floorStallPlace || "—",
  };
}
