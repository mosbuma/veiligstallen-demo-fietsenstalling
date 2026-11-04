import { sectionAccepts, type SectionParkingMeta } from "@/lib/biketype-stalling";
import { prisma } from "@/lib/db";
import { getMetadataBundle } from "@/lib/fms/metadata-cache";
import { getSettings } from "@/lib/settings";
import { activeStallingScope } from "@/lib/stalling-scope";

export const OTHER_SECTION_ID = "OTHER";
export type { SectionParkingMeta } from "@/lib/biketype-stalling";
export { sectionAccepts, stallingHandlesBiketype } from "@/lib/biketype-stalling";

export type ParkingAssignment = {
  placementKind: "assigned" | "other";
  sectionId: string;
  stallPlace: string;
  fmsSectionId: string;
};

function parseBiketypeIds(row: Record<string, unknown>): number[] | null {
  const raw =
    row.biketypeids ??
    row.biketypeIds ??
    row.allowedbiketypeids ??
    row.allowedBiketypeIds;
  if (Array.isArray(raw)) {
    const ids = raw.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    return ids.length ? ids : null;
  }
  const single = row.biketypeid ?? row.biketypeId ?? row.biketype;
  if (single != null && single !== "") {
    const n = Number(single);
    if (!Number.isNaN(n)) return [n];
  }
  return null;
}

export function parseSectionsForParking(sectionsJson: unknown, defaultCapacity: number): SectionParkingMeta[] {
  if (!Array.isArray(sectionsJson)) return [];
  const out: SectionParkingMeta[] = [];
  for (const s of sectionsJson) {
    const row = s as Record<string, unknown>;
    const sectionid = String(row.sectionid ?? row.id ?? row.sectionID ?? "").trim();
    if (!sectionid) continue;
    const capRaw = row.capacity ?? row.numberofplaces ?? row.numberOfPlaces ?? row.maxplaces;
    const capacity = typeof capRaw === "number" && capRaw > 0 ? capRaw : defaultCapacity;
    out.push({
      sectionid,
      name: row.name != null ? String(row.name) : undefined,
      capacity,
      biketypeIds: parseBiketypeIds(row),
    });
  }
  return out;
}

export async function assignParking(
  biketypeId: number,
  opts?: { excludeVisitId?: string; excludeBicycleId?: string }
): Promise<ParkingAssignment> {
  const settings = await getSettings();
  const bundle = await getMetadataBundle();
  const sections = parseSectionsForParking(bundle.sections.json, settings.defaultSectionCapacity);
  const fallbackFms = sections[0]?.sectionid ?? "";

  const scope = await activeStallingScope();
  const [visitSlots, bikeSlots] = await Promise.all([
    prisma.visit.findMany({
      where: {
        ...scope,
        status: "open",
        physicallyPresent: true,
        placementKind: "assigned",
        ...(opts?.excludeVisitId ? { id: { not: opts.excludeVisitId } } : {}),
      },
      select: { sectionId: true, stallPlace: true },
    }),
    prisma.bicycle.findMany({
      where: {
        ...scope,
        floorPresent: true,
        floorPlacementKind: "assigned",
        ...(opts?.excludeBicycleId ? { id: { not: opts.excludeBicycleId } } : {}),
      },
      select: { floorSectionId: true, floorStallPlace: true },
    }),
  ]);
  const taken = new Set([
    ...visitSlots.map((o) => `${o.sectionId}:${o.stallPlace}`),
    ...bikeSlots.map((o) => `${o.floorSectionId}:${o.floorStallPlace}`),
  ]);

  for (const section of sections) {
    if (!sectionAccepts(section, biketypeId)) continue;
    for (let p = 1; p <= section.capacity; p++) {
      const place = String(p);
      const key = `${section.sectionid}:${place}`;
      if (!taken.has(key)) {
        return {
          placementKind: "assigned",
          sectionId: section.sectionid,
          stallPlace: place,
          fmsSectionId: section.sectionid,
        };
      }
    }
  }

  const fmsSection =
    sections.find((s) => sectionAccepts(s, biketypeId))?.sectionid ?? fallbackFms;

  return {
    placementKind: "other",
    sectionId: OTHER_SECTION_ID,
    stallPlace: "",
    fmsSectionId: fmsSection,
  };
}

export function fmsSectionIdForVisit(visit: {
  sectionId: string;
  fmsSectionId?: string | null;
}): string {
  const fms = visit.fmsSectionId?.trim();
  if (fms) return fms;
  if (visit.sectionId === OTHER_SECTION_ID) return "";
  return visit.sectionId;
}
